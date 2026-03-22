import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatRawTranscriptEmail } from '../../src/content/modal/formatRawEmail';

describe('formatRawTranscriptEmail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:00:00Z'));
  });

  it('generates correct subject with title and date', () => {
    const result = formatRawTranscriptEmail('test transcript', 'Sprint Review', ['Alice']);

    expect(result.subject).toBe('[회의록 원문] Sprint Review - 2026-03-22');
  });

  it('generates HTML body containing meeting info and transcript', () => {
    const result = formatRawTranscriptEmail(
      'This is the meeting content.',
      'Weekly Standup',
      ['Alice', 'Bob'],
    );

    expect(result.htmlBody).toContain('Weekly Standup');
    expect(result.htmlBody).toContain('Alice, Bob');
    expect(result.htmlBody).toContain('2026-03-22');
    expect(result.htmlBody).toContain('This is the meeting content.');
  });

  it('handles empty attendees array', () => {
    const result = formatRawTranscriptEmail('transcript', 'Meeting', []);

    expect(result.htmlBody).toContain('-');
    expect(result.htmlBody).not.toContain(', ');
  });

  it('sanitizes HTML tags in transcript', () => {
    const malicious = '<script>alert("xss")</script>Hello world';
    const result = formatRawTranscriptEmail(malicious, 'Test', ['Alice']);

    expect(result.htmlBody).not.toContain('<script>');
    expect(result.htmlBody).toContain('Hello world');
  });

  it('sanitizes HTML tags in meeting title within body', () => {
    const result = formatRawTranscriptEmail('transcript', '<img onerror="alert(1)">Meeting', ['Alice']);

    // htmlBody is sanitized via DOMPurify
    expect(result.htmlBody).not.toContain('onerror');
    // subject is plain text (email header), not rendered as HTML
    expect(result.subject).toContain('Meeting');
  });

  it('strips CRLF from subject to prevent header injection', () => {
    const maliciousTitle = 'Meeting\r\nBcc: attacker@evil.com';
    const result = formatRawTranscriptEmail('transcript', maliciousTitle, ['Alice']);

    expect(result.subject).not.toContain('\r');
    expect(result.subject).not.toContain('\n');
    expect(result.subject).toContain('Meeting');
  });

  it('handles special characters in title', () => {
    const result = formatRawTranscriptEmail('transcript', '회의 & 리뷰 (2026)', ['Alice']);

    expect(result.subject).toContain('회의 & 리뷰 (2026)');
    expect(result.htmlBody).toContain('회의');
  });

  it('preserves long transcript content', () => {
    const longText = '이것은 긴 회의록입니다. '.repeat(500);
    const result = formatRawTranscriptEmail(longText, 'Long Meeting', ['Alice']);

    expect(result.htmlBody).toContain('이것은 긴 회의록입니다.');
  });

  it('returns subject and htmlBody as strings', () => {
    const result = formatRawTranscriptEmail('transcript', 'Test', ['Alice']);

    expect(typeof result.subject).toBe('string');
    expect(typeof result.htmlBody).toBe('string');
  });
});
