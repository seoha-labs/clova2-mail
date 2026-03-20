import { describe, it, expect } from 'vitest';
import { createMimeMessage } from '../../src/background/gmail';

describe('createMimeMessage', () => {
  it('creates valid MIME message with multipart/alternative', () => {
    const mime = createMimeMessage(
      ['test@example.com'],
      'Test Subject',
      '<h1>Hello</h1><p>World</p>',
    );

    expect(mime).toContain('To: test@example.com');
    expect(mime).toContain('Subject: =?UTF-8?B?');
    expect(mime).toContain('MIME-Version: 1.0');
    expect(mime).toContain('multipart/alternative');
    expect(mime).toContain('text/plain; charset=UTF-8');
    expect(mime).toContain('text/html; charset=UTF-8');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
  });

  it('handles Korean subject without corruption', () => {
    const mime = createMimeMessage(
      ['test@example.com'],
      '[회의록] 주간 스프린트 미팅 - 2026-03-19',
      '<p>테스트</p>',
    );

    // Subject should be B-encoded
    expect(mime).toContain('Subject: =?UTF-8?B?');
    // Decode and verify
    const subjectLine = mime.split('\r\n').find((l) => l.startsWith('Subject:'));
    expect(subjectLine).toBeDefined();

    const b64Match = subjectLine!.match(/=\?UTF-8\?B\?(.+?)\?=/);
    expect(b64Match).toBeTruthy();

    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(b64Match![1]), (c) => c.charCodeAt(0)),
    );
    expect(decoded).toBe('[회의록] 주간 스프린트 미팅 - 2026-03-19');
  });

  it('handles Korean body content', () => {
    const htmlBody = '<h2>회의 요약</h2><p>이번 스프린트에서는 API 개발을 진행했습니다.</p>';
    const mime = createMimeMessage(
      ['test@example.com'],
      'Test',
      htmlBody,
    );

    // Find the HTML base64 block (second base64 block after text/html)
    const lines = mime.split('\r\n');
    const htmlTypeIndex = lines.findIndex((l) => l.includes('text/html'));
    expect(htmlTypeIndex).toBeGreaterThan(-1);

    // After Content-Transfer-Encoding: base64 and empty line, next non-empty is the base64 body
    const base64Lines: string[] = [];
    let foundEncoding = false;
    for (let i = htmlTypeIndex; i < lines.length; i++) {
      if (lines[i].includes('Content-Transfer-Encoding: base64')) {
        foundEncoding = true;
        continue;
      }
      if (foundEncoding && lines[i] === '') continue;
      if (foundEncoding && lines[i].startsWith('--')) break;
      if (foundEncoding && lines[i]) base64Lines.push(lines[i]);
    }

    const decodedBody = new TextDecoder().decode(
      Uint8Array.from(atob(base64Lines.join('')), (c) => c.charCodeAt(0)),
    );
    expect(decodedBody).toContain('회의 요약');
    expect(decodedBody).toContain('스프린트');
  });

  it('handles multiple recipients', () => {
    const mime = createMimeMessage(
      ['a@test.com', 'b@test.com', 'c@test.com'],
      'Subject',
      '<p>Body</p>',
    );
    expect(mime).toContain('To: a@test.com, b@test.com, c@test.com');
  });

  it('includes plain text fallback', () => {
    const mime = createMimeMessage(
      ['test@example.com'],
      'Subject',
      '<h1>Title</h1><p>Paragraph</p><ul><li>Item</li></ul>',
    );

    // Should have both text/plain and text/html parts
    const plainCount = (mime.match(/text\/plain/g) || []).length;
    const htmlCount = (mime.match(/text\/html/g) || []).length;
    expect(plainCount).toBe(1);
    expect(htmlCount).toBe(1);
  });
});
