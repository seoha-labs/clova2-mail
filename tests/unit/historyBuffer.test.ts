import { describe, it, expect } from 'vitest';
import { truncateBody, MAX_BODY_BYTES } from '../../src/shared/historyBuffer';

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

describe('truncateBody', () => {
  it('returns the body unchanged when within the byte cap', () => {
    const body = '<p>짧은 본문</p>';
    const result = truncateBody(body);
    expect(result.bodyHtml).toBe(body);
    expect(result.truncated).toBe(false);
  });

  it('truncates and flags a body that exceeds MAX_BODY_BYTES', () => {
    const big = '<p>' + 'a'.repeat(MAX_BODY_BYTES + 1000) + '</p>';
    const result = truncateBody(big);
    expect(result.truncated).toBe(true);
    expect(utf8Bytes(result.bodyHtml)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(result.bodyHtml).toContain('[내용이 잘렸습니다]');
  });

  it('does not split a multibyte (Korean) character across the cut', () => {
    // Each '가' is 3 UTF-8 bytes; build a body well over the cap.
    const big = '가'.repeat(MAX_BODY_BYTES);
    const result = truncateBody(big);
    expect(result.truncated).toBe(true);
    // If a multibyte char were split, decoding would yield U+FFFD.
    expect(result.bodyHtml).not.toContain('�');
  });
});

import { makeSentEmail, MAX_BODY_BYTES as _CAP } from '../../src/shared/historyBuffer';

describe('makeSentEmail', () => {
  it('builds a success entry, defaulting cc/bcc to []', () => {
    const entry = makeSentEmail({
      id: 'fixed-id',
      sentAt: 1_700_000_000_000,
      to: ['a@b.com'],
      subject: '제목',
      bodyHtml: '<p>본문</p>',
      mode: 'summarize',
      success: true,
    });
    expect(entry).toEqual({
      id: 'fixed-id',
      sentAt: 1_700_000_000_000,
      to: ['a@b.com'],
      cc: [],
      bcc: [],
      subject: '제목',
      bodyHtml: '<p>본문</p>',
      mode: 'summarize',
      success: true,
      truncated: false,
    });
  });

  it('records the error and marks success=false on a failure entry', () => {
    const entry = makeSentEmail({
      id: 'id2',
      sentAt: 1,
      to: ['x@y.com'],
      cc: ['c@d.com'],
      bcc: ['e@f.com'],
      subject: 'S',
      bodyHtml: 'B',
      mode: 'raw',
      success: false,
      error: 'HTTP 500',
    });
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('HTTP 500');
    expect(entry.cc).toEqual(['c@d.com']);
    expect(entry.bcc).toEqual(['e@f.com']);
  });

  it('truncates an oversized body and sets truncated=true', () => {
    const entry = makeSentEmail({
      id: 'id3',
      sentAt: 1,
      to: ['a@b.com'],
      subject: 'S',
      bodyHtml: 'a'.repeat(_CAP + 5000),
      mode: 'summarize',
      success: true,
    });
    expect(entry.truncated).toBe(true);
    expect(entry.bodyHtml).toContain('[내용이 잘렸습니다]');
  });
});
