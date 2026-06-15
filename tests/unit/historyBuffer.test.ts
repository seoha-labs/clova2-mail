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
