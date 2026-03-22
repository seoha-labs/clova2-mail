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
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn(),
  },
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { summarizeTranscript, countTokens } from '../../src/background/openai';
import { sendViaGmail, createMimeMessage } from '../../src/background/gmail';
import { MAX_TOKENS_CHUNK } from '../../src/shared/constants';

function makeSummaryJson(): SummaryJson {
  return {
    summary: 'Summary',
    decisions: ['D1'],
    action_items: [{ task: 'T1', assignee: 'A', deadline: 'D' }],
    attendees: ['A'],
    keywords: ['K'],
  };
}

function openAiOk(content: object) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  describe('Empty transcript', () => {
    it('handles empty string transcript without crashing', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(openAiOk(makeSummaryJson()));

      // Empty string has 0 tokens, which is <= MAX_TOKENS_SINGLE, so goes single-call path
      const result = await summarizeTranscript('', 'Empty Meeting');
      expect(result.subject).toContain('Empty Meeting');
    });

    it('empty transcript produces 0 tokens', () => {
      expect(countTokens('')).toBe(0);
    });
  });

  describe('Token limit boundary: >100K tokens', () => {
    it('rejects transcript exceeding MAX_TOKENS_CHUNK', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      // Build text that exceeds 100K tokens
      const hugeText = '이것은 매우 긴 텍스트입니다. '.repeat(50000);
      const tokens = countTokens(hugeText);
      expect(tokens).toBeGreaterThan(MAX_TOKENS_CHUNK);

      await expect(summarizeTranscript(hugeText, 'Huge')).rejects.toThrow('토큰');
    });
  });

  describe('Network failure', () => {
    it('propagates fetch TypeError on DNS failure', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('Failed to fetch');
    });

    it('propagates fetch abort error', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('aborted');
    });
  });

  describe('Invalid API key', () => {
    it('throws on 401 Unauthorized', async () => {
      storageStore['openaiApiKey'] = 'sk-invalid';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
          status: 401,
        }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('401');
    });

    it('throws on 429 rate limit', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
          status: 429,
        }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('429');
    });

    it('throws on 500 server error', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Internal server error' } }), {
          status: 500,
        }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('500');
    });
  });

  describe('Malformed JSON response', () => {
    it('throws on non-JSON content in choices', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{{invalid json' } }] }),
          { status: 200 },
        ),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow();
    });

    it('throws when choices array is empty', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow('empty response');
    });

    it('throws when response body is not valid JSON', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response('not json at all', { status: 200 }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow();
    });

    it('throws when choices is null', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: null }), { status: 200 }),
      );

      await expect(summarizeTranscript('text', 'title')).rejects.toThrow();
    });
  });

  describe('Gmail edge cases', () => {
    it('sendViaGmail handles empty recipients list', async () => {
      (chrome.identity.getAuthToken as ReturnType<typeof vi.fn>).mockImplementation(
        (_opts: unknown, cb: (result: { token: string }) => void) => cb({ token: 'tok' }),
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }),
      );

      const result = await sendViaGmail([], 'Subject', '<p>Body</p>');
      // Gmail API would reject this, but the client code doesn't validate
      expect(result.success).toBe(true);
    });

    it('createMimeMessage handles special characters in subject', () => {
      const mime = createMimeMessage(
        ['test@example.com'],
        'Re: [External] 회의록 & "Notes" <Draft>',
        '<p>Body</p>',
      );
      // Subject should be B-encoded and safe from header injection
      expect(mime).toContain('Subject: =?UTF-8?B?');
      expect(mime).not.toContain('\r\nBcc:');
    });

    it('createMimeMessage handles very long subject', () => {
      const longSubject = '회의록 '.repeat(100);
      const mime = createMimeMessage(['test@example.com'], longSubject, '<p>B</p>');
      expect(mime).toContain('Subject: =?UTF-8?B?');
    });

    it('createMimeMessage handles empty HTML body', () => {
      const mime = createMimeMessage(['test@example.com'], 'Subject', '');
      expect(mime).toContain('multipart/alternative');
      expect(mime).toContain('text/plain');
      expect(mime).toContain('text/html');
    });
  });

  describe('Unicode and encoding edge cases', () => {
    it('handles mixed Korean/English/emoji in transcript', async () => {
      storageStore['openaiApiKey'] = 'sk-test';
      mockFetch.mockResolvedValueOnce(openAiOk(makeSummaryJson()));

      const mixedText = 'Hello 안녕하세요 meeting discussion 회의 내용';
      const result = await summarizeTranscript(mixedText, '한영 혼합 회의');
      expect(result.subject).toContain('한영 혼합 회의');
    });

    it('countTokens handles Unicode correctly', () => {
      const korean = '안녕하세요';
      const english = 'Hello';
      const koreanTokens = countTokens(korean);
      const englishTokens = countTokens(english);

      // Korean typically uses more tokens per character
      expect(koreanTokens).toBeGreaterThan(0);
      expect(englishTokens).toBeGreaterThan(0);
    });
  });
});
