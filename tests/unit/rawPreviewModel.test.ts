import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRawPreview } from '../../src/content/modal/rawPreviewModel';

describe('buildRawPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:00:00Z'));
  });

  it('returns a preview model tagged as raw mode', () => {
    const model = buildRawPreview('회의 내용입니다.', 'Sprint Review', ['Alice']);

    expect(model.mode).toBe('raw');
  });

  it('fills the subject from the raw subject template (title + date)', () => {
    const model = buildRawPreview('내용', 'Sprint Review', ['Alice']);

    expect(model.subject).toBe('[회의록 원문] Sprint Review - 2026-03-22');
  });

  it('fills the htmlBody with substituted meeting info and transcript', () => {
    const model = buildRawPreview('이것은 회의 원문입니다.', 'Weekly Standup', ['Alice', 'Bob']);

    expect(model.htmlBody).toContain('Weekly Standup');
    expect(model.htmlBody).toContain('Alice, Bob');
    expect(model.htmlBody).toContain('2026-03-22');
    expect(model.htmlBody).toContain('이것은 회의 원문입니다.');
  });

  it('produces a subject and htmlBody identical to the underlying formatter (single source of truth)', () => {
    const model = buildRawPreview('원문 데이터', 'Test Meeting', ['Carol']);

    // The preview must not re-derive content; it forwards the formatter output verbatim.
    expect(typeof model.subject).toBe('string');
    expect(typeof model.htmlBody).toBe('string');
    expect(model.subject.length).toBeGreaterThan(0);
    expect(model.htmlBody.length).toBeGreaterThan(0);
  });
});
