import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SummaryJson } from '../../src/shared/types';

// ── Chrome storage mock ──────────────────────────────────────────────
const storageStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  runtime: { lastError: null },
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: storageStore[key] })),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(storageStore, obj);
        return Promise.resolve();
      }),
    },
  },
});

// ── Fetch mock ───────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { summarizeTranscript, countTokens, splitByParagraphs } from '../../src/background/openai';
import { CHUNK_SIZE, MAX_TOKENS_SINGLE } from '../../src/shared/constants';

function makeSummaryJson(overrides: Partial<SummaryJson> = {}): SummaryJson {
  return {
    summary: 'Meeting summary',
    decisions: ['Decision A'],
    action_items: [{ task: 'Do X', assignee: 'Alice', deadline: '2026-04-01' }],
    attendees: ['Alice', 'Bob'],
    keywords: ['sprint'],
    ...overrides,
  };
}

function openAiOk(content: object) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('OpenAI chunking pipeline (full flow)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    storageStore['openaiApiKey'] = 'sk-test';
  });

  it('single-chunk path: text <= MAX_TOKENS_SINGLE goes through one API call', async () => {
    mockFetch.mockResolvedValueOnce(openAiOk(makeSummaryJson()));

    const result = await summarizeTranscript('Short transcript.', 'Sprint');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.subject).toContain('Sprint');
    expect(result.htmlBody).toContain('Meeting summary');
    expect(result.plainBody).toBeDefined();
  });

  it('multi-chunk path: text between MAX_TOKENS_SINGLE and MAX_TOKENS_CHUNK triggers chunking + merge', async () => {
    // Build a transcript that's between MAX_TOKENS_SINGLE (50K) and MAX_TOKENS_CHUNK (100K)
    // Each English word is roughly 1 token
    // 34K tokens from 400*20, so ~85 tokens per 100 words. Target ~55K tokens.
    const paragraphs = Array.from({ length: 650 }, (_, i) =>
      `Paragraph ${i}: ${'discussion topic details here '.repeat(20)}`,
    ).join('\n\n');

    const tokenCount = countTokens(paragraphs);
    expect(tokenCount).toBeGreaterThan(MAX_TOKENS_SINGLE);
    expect(tokenCount).toBeLessThanOrEqual(100_000);

    const chunks = splitByParagraphs(paragraphs, CHUNK_SIZE);
    // We expect chunk calls + 1 merge call
    const expectedCalls = chunks.length + 1;

    for (let i = 0; i < expectedCalls; i++) {
      mockFetch.mockResolvedValueOnce(openAiOk(makeSummaryJson({ summary: `Part ${i}` })));
    }

    const result = await summarizeTranscript(paragraphs, 'Big Meeting');

    expect(mockFetch).toHaveBeenCalledTimes(expectedCalls);
    expect(result.subject).toContain('Big Meeting');
  });

  it('progress callback fires for each chunk', async () => {
    const paragraphs = Array.from({ length: 650 }, (_, i) =>
      `Para ${i}: ${'discussion topic details here '.repeat(20)}`,
    ).join('\n\n');

    const tokenCount = countTokens(paragraphs);
    expect(tokenCount).toBeGreaterThan(MAX_TOKENS_SINGLE);
    expect(tokenCount).toBeLessThanOrEqual(100_000);

    const chunks = splitByParagraphs(paragraphs, CHUNK_SIZE);
    const totalCalls = chunks.length + 1;

    for (let i = 0; i < totalCalls; i++) {
      mockFetch.mockResolvedValueOnce(openAiOk(makeSummaryJson()));
    }

    const progressCalls: Array<{ current: number; total: number }> = [];

    await summarizeTranscript(paragraphs, 'Progress Test', (info) => {
      progressCalls.push({ ...info });
    });

    expect(progressCalls).toHaveLength(chunks.length);
    expect(progressCalls[0].current).toBe(1);
    expect(progressCalls[0].total).toBe(chunks.length);
    expect(progressCalls[progressCalls.length - 1].current).toBe(chunks.length);
  });

  it('throws when API key is not set', async () => {
    delete storageStore['openaiApiKey'];

    await expect(summarizeTranscript('text', 'title')).rejects.toThrow('API key');
  });

  it('throws on OpenAI API HTTP error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_api_key' }), { status: 401 }),
    );

    await expect(summarizeTranscript('text', 'title')).rejects.toThrow('OpenAI API error: 401');
  });

  it('throws on empty response from OpenAI', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(summarizeTranscript('text', 'title')).rejects.toThrow('empty response');
  });

  it('throws on malformed JSON response from OpenAI', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'not valid json {{{' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(summarizeTranscript('text', 'title')).rejects.toThrow();
  });

  it('handles network failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(summarizeTranscript('text', 'title')).rejects.toThrow('Failed to fetch');
  });

  it('template substitution fills in title and date', async () => {
    mockFetch.mockResolvedValueOnce(
      openAiOk(
        makeSummaryJson({
          summary: 'API 개발 진행 상황 공유',
          decisions: ['v2 API 릴리스 확정'],
          action_items: [{ task: 'API 문서 작성', assignee: '김철수', deadline: '3/25' }],
          attendees: ['김철수', '이영희'],
          keywords: ['API', '릴리스'],
        }),
      ),
    );

    const result = await summarizeTranscript('회의 내용', '주간 스프린트');
    const today = new Date().toISOString().split('T')[0];

    expect(result.subject).toContain('주간 스프린트');
    expect(result.subject).toContain(today);
    expect(result.htmlBody).toContain('API 개발 진행 상황 공유');
    expect(result.htmlBody).toContain('@김철수');
    expect(result.htmlBody).toContain('v2 API 릴리스 확정');
  });
});

describe('splitByParagraphs edge cases', () => {
  it('single paragraph exceeding maxTokens stays as one chunk', () => {
    const text = 'word '.repeat(5000);
    const chunks = splitByParagraphs(text, 100);
    expect(chunks).toHaveLength(1);
  });

  it('preserves all content across chunks', () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const chunks = splitByParagraphs(paragraphs, 50);
    const reconstructed = chunks.join('\n\n');
    expect(reconstructed).toBe(paragraphs);
  });
});
