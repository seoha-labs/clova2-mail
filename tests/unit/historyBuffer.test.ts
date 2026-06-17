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

import {
  appendToBuffer,
  MAX_HISTORY_ENTRIES,
  MAX_TOTAL_BYTES,
} from '../../src/shared/historyBuffer';
import type { SentEmail } from '../../src/shared/types';

function makeEntry(id: string, bodyHtml = '<p>x</p>'): SentEmail {
  return makeSentEmail({
    id,
    sentAt: Number(id),
    to: ['a@b.com'],
    subject: 'S',
    bodyHtml,
    mode: 'summarize',
    success: true,
  });
}

describe('appendToBuffer', () => {
  it('prepends the newest entry without mutating the input', () => {
    const history = [makeEntry('1')];
    const next = appendToBuffer(history, makeEntry('2'));
    expect(next[0].id).toBe('2');
    expect(next[1].id).toBe('1');
    expect(history).toHaveLength(1); // input untouched
  });

  it('trims to MAX_HISTORY_ENTRIES, dropping the oldest', () => {
    let history: readonly SentEmail[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i++) {
      history = appendToBuffer(history, makeEntry(String(i)));
    }
    expect(history).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(history[0].id).toBe(String(MAX_HISTORY_ENTRIES + 9)); // newest
    // oldest survivor is index (count-1 - (MAX-1)) = 10
    expect(history[history.length - 1].id).toBe('10');
  });

  it('drops oldest entries until total serialized size fits the quota', () => {
    // Each body ~100KB; a handful blows past MAX_TOTAL_BYTES.
    const bigBody = '<p>' + 'a'.repeat(100 * 1024) + '</p>';
    let history: readonly SentEmail[] = [];
    for (let i = 0; i < 60; i++) {
      history = appendToBuffer(history, makeEntry(String(i), bigBody));
    }
    const totalBytes = new TextEncoder().encode(JSON.stringify(history)).length;
    expect(totalBytes).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
    expect(history[0].id).toBe('59'); // newest always kept
    expect(history.length).toBeGreaterThan(0);
  });

  it('always keeps the newest entry even if it alone is near the cap', () => {
    const nearCap = '<p>' + 'a'.repeat(200 * 1024) + '</p>';
    const history = appendToBuffer([], makeEntry('1', nearCap));
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('1');
  });
});

import { removeFromBuffer } from '../../src/shared/historyBuffer';

describe('removeFromBuffer', () => {
  it('removes the entry with the given id without mutating input', () => {
    const history = [makeEntry('1'), makeEntry('2'), makeEntry('3')];
    const next = removeFromBuffer(history, '2');
    expect(next.map((e) => e.id)).toEqual(['1', '3']);
    expect(history).toHaveLength(3); // input untouched
  });

  it('returns an equivalent array when the id is absent', () => {
    const history = [makeEntry('1')];
    const next = removeFromBuffer(history, 'nope');
    expect(next.map((e) => e.id)).toEqual(['1']);
  });
});
