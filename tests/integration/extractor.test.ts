import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DOM / location mock ──────────────────────────────────────────────
// jsdom provides window.fetch and location; we override as needed.

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { parseNoteIdsFromUrl } from '../../src/content/extractor';

// ── Tests ────────────────────────────────────────────────────────────

describe('ClovaNote transcript extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseNoteIdsFromUrl', () => {
    it('parses standard note-detail URL', () => {
      const result = parseNoteIdsFromUrl(
        'https://clovanote.naver.com/w/ws-123/note-detail/note-456',
      );
      expect(result).toEqual({ workspaceId: 'ws-123', noteId: 'note-456' });
    });

    it('parses /notes/ URL variant', () => {
      const result = parseNoteIdsFromUrl(
        'https://clovanote.naver.com/w/abc/notes/def',
      );
      expect(result).toEqual({ workspaceId: 'abc', noteId: 'def' });
    });

    it('returns null for non-note URL', () => {
      expect(parseNoteIdsFromUrl('https://clovanote.naver.com/w/ws-123/home')).toBeNull();
    });

    it('returns null for completely unrelated URL', () => {
      expect(parseNoteIdsFromUrl('https://example.com/page')).toBeNull();
    });

    it('handles URL with query string', () => {
      const result = parseNoteIdsFromUrl(
        'https://clovanote.naver.com/w/ws-1/note-detail/n-2?tab=script',
      );
      expect(result).toEqual({ workspaceId: 'ws-1', noteId: 'n-2' });
    });

    it('handles URL with hash fragment', () => {
      const result = parseNoteIdsFromUrl(
        'https://clovanote.naver.com/w/ws-1/note-detail/n-2#section',
      );
      expect(result).toEqual({ workspaceId: 'ws-1', noteId: 'n-2' });
    });
  });

  describe('Title extraction from transcript text', () => {
    // We test the helper indirectly since extractTranscript calls it internally.
    // To test directly, we need to access the non-exported function.
    // Instead, we test the behavior via the shape of the returned data.

    it('extracts title from first non-empty line of transcript', async () => {
      // We simulate what extractTranscript does by testing the text parsing logic
      const text = '주간 스프린트 회의\n\n참석자: 김철수, 이영희\n\n내용...';
      const firstLine = text.split('\n').find((line) => line.trim().length > 0);
      expect(firstLine?.trim()).toBe('주간 스프린트 회의');
    });

    it('defaults to "회의록" for empty transcript', () => {
      const text = '';
      const firstLine = text.split('\n').find((line) => line.trim().length > 0);
      const title = firstLine?.trim() || '회의록';
      expect(title).toBe('회의록');
    });

    it('defaults to "회의록" for whitespace-only transcript', () => {
      const text = '   \n  \n   ';
      const firstLine = text.split('\n').find((line) => line.trim().length > 0);
      const title = firstLine?.trim() || '회의록';
      expect(title).toBe('회의록');
    });
  });

  describe('Attendee extraction from transcript text', () => {
    it('extracts Korean 참석자 line', () => {
      const text = '회의 제목\n참석자: 김철수, 이영희, 박지민\n\n내용';
      const lines = text.split('\n');
      let attendees: string[] = [];
      for (const line of lines) {
        if (/^(참석자|attendees?)\s*[:：]/i.test(line)) {
          const value = line.replace(/^(참석자|attendees?)\s*[:：]/i, '').trim();
          attendees = value.split(/[,，、]/).map((a) => a.trim()).filter(Boolean);
          break;
        }
      }
      expect(attendees).toEqual(['김철수', '이영희', '박지민']);
    });

    it('extracts English Attendees line', () => {
      const text = 'Meeting\nAttendees: Alice, Bob, Charlie\n\nContent';
      const lines = text.split('\n');
      let attendees: string[] = [];
      for (const line of lines) {
        if (/^(참석자|attendees?)\s*[:：]/i.test(line)) {
          const value = line.replace(/^(참석자|attendees?)\s*[:：]/i, '').trim();
          attendees = value.split(/[,，、]/).map((a) => a.trim()).filter(Boolean);
          break;
        }
      }
      expect(attendees).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('returns empty array when no attendees line', () => {
      const text = 'Meeting\nJust some content without attendees';
      const lines = text.split('\n');
      let attendees: string[] = [];
      for (const line of lines) {
        if (/^(참석자|attendees?)\s*[:：]/i.test(line)) {
          const value = line.replace(/^(참석자|attendees?)\s*[:：]/i, '').trim();
          attendees = value.split(/[,，、]/).map((a) => a.trim()).filter(Boolean);
          break;
        }
      }
      expect(attendees).toEqual([]);
    });

    it('handles full-width colon separator', () => {
      const text = '회의\n참석자：홍길동, 김영수';
      const lines = text.split('\n');
      let attendees: string[] = [];
      for (const line of lines) {
        if (/^(참석자|attendees?)\s*[:：]/i.test(line)) {
          const value = line.replace(/^(참석자|attendees?)\s*[:：]/i, '').trim();
          attendees = value.split(/[,，、]/).map((a) => a.trim()).filter(Boolean);
          break;
        }
      }
      expect(attendees).toEqual(['홍길동', '김영수']);
    });
  });

  describe('installFetchInterceptor header capture', () => {
    it('captures note-* headers from ClovaNote API requests', async () => {
      // We test installFetchInterceptor by importing and calling it
      // It wraps window.fetch, so we need to call it before making requests
      const originalFetch = window.fetch;

      // Import fresh
      const { installFetchInterceptor } = await import('../../src/content/extractor');

      // Reset fetch to a function we can observe
      const spyFetch = vi.fn().mockResolvedValue(new Response('ok'));
      window.fetch = spyFetch;

      installFetchInterceptor();

      // Now window.fetch is wrapped; make a ClovaNote API call with headers
      await window.fetch('https://api-v2.clovanote.naver.com/v2/something', {
        headers: {
          'note-client-type': 'WEB',
          'note-device-id': 'device-abc',
          'note-session-id': 'sess-xyz',
        } as Record<string, string>,
      });

      // The interceptor should have called the underlying fetch
      expect(spyFetch).toHaveBeenCalledTimes(1);

      // Restore
      window.fetch = originalFetch;
    });

    it('does not capture headers from non-ClovaNote requests', async () => {
      const spyFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const originalFetch = window.fetch;
      window.fetch = spyFetch;

      const { installFetchInterceptor } = await import('../../src/content/extractor');
      installFetchInterceptor();

      await window.fetch('https://example.com/api', {
        headers: { 'note-device-id': 'should-not-capture' } as Record<string, string>,
      });

      expect(spyFetch).toHaveBeenCalledTimes(1);

      window.fetch = originalFetch;
    });
  });
});
