import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chrome API mock (must be set BEFORE importing src/background/index) ──
const storageStore: Record<string, unknown> = {};

const chromeMock = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    lastError: null as { message?: string } | null,
  },
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
};

vi.stubGlobal('chrome', chromeMock);

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import registers the listener
await import('../../src/background/index');

// Capture the handler RIGHT AFTER import, before any test clears mocks
const registeredHandler = chromeMock.runtime.onMessage.addListener.mock.calls[0][0] as (
  message: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void,
) => boolean;

// ── Helpers ──────────────────────────────────────────────────────────

function makeSummaryJson() {
  return {
    summary: 'Test summary of the meeting.',
    decisions: ['Decision 1'],
    action_items: [{ task: 'Task 1', assignee: 'Alice', deadline: '2026-03-28' }],
    attendees: ['Alice', 'Bob'],
    keywords: ['sprint', 'release'],
  };
}

function openAiOkResponse(content: object) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function gmailOkResponse(messageId = 'msg_123') {
  return new Response(JSON.stringify({ id: messageId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function userinfoOkResponse(email = 'user@gmail.com') {
  return new Response(JSON.stringify({ email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function sendMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    registeredHandler(message, {}, resolve);
  });
}

function mockTokenSuccess(token: string) {
  chromeMock.identity.getAuthToken.mockImplementation(
    (_opts: unknown, cb: (result: { token: string }) => void) => {
      chromeMock.runtime.lastError = null;
      cb({ token });
    },
  );
}

function mockTokenFailure(message: string) {
  chromeMock.identity.getAuthToken.mockImplementation(
    (_opts: unknown, cb: (result: unknown) => void) => {
      chromeMock.runtime.lastError = { message };
      cb(undefined);
      chromeMock.runtime.lastError = null;
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Background message routing', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    chromeMock.identity.getAuthToken.mockReset();
    chromeMock.identity.removeCachedAuthToken.mockReset();
    chromeMock.runtime.lastError = null;
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  describe('EXTRACT_AND_SUMMARIZE', () => {
    it('returns SUMMARIZE_RESULT with success on valid transcript', async () => {
      storageStore['openaiApiKey'] = 'sk-test-key';
      mockFetch.mockResolvedValueOnce(openAiOkResponse(makeSummaryJson()));

      const result = (await sendMessage({
        type: 'EXTRACT_AND_SUMMARIZE',
        payload: { transcript: 'Short meeting transcript.', meetingTitle: 'Sprint Review' },
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'SUMMARIZE_RESULT');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(true);
      expect(payload.subject).toBeDefined();
      expect(payload.htmlBody).toBeDefined();
    });

    it('returns error when API key is missing', async () => {
      const result = (await sendMessage({
        type: 'EXTRACT_AND_SUMMARIZE',
        payload: { transcript: 'Some text', meetingTitle: 'Test' },
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'SUMMARIZE_RESULT');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('API_ERROR');
    });

    it('returns TOKEN_LIMIT_EXCEEDED for extremely long transcripts', async () => {
      storageStore['openaiApiKey'] = 'sk-test-key';
      const longTranscript = '이것은 매우 긴 회의록입니다. '.repeat(50000);

      const result = (await sendMessage({
        type: 'EXTRACT_AND_SUMMARIZE',
        payload: { transcript: longTranscript, meetingTitle: 'Long Meeting' },
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'SUMMARIZE_RESULT');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('TOKEN_LIMIT_EXCEEDED');
    });
  });

  describe('SEND_EMAIL', () => {
    it('returns EMAIL_SENT on successful send', async () => {
      mockTokenSuccess('tok_123');
      mockFetch.mockResolvedValueOnce(gmailOkResponse('msg_456'));

      const result = (await sendMessage({
        type: 'SEND_EMAIL',
        payload: { to: ['test@example.com'], subject: 'Test', htmlBody: '<p>Hello</p>' },
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'EMAIL_SENT');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(true);
      expect(payload.messageId).toBe('msg_456');
    });

    it('returns error when Gmail auth fails', async () => {
      mockTokenFailure('User not signed in');

      const result = (await sendMessage({
        type: 'SEND_EMAIL',
        payload: { to: ['a@b.com'], subject: 'S', htmlBody: '<p>B</p>' },
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'EMAIL_SENT');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(false);
      expect(payload.error).toContain('User not signed in');
    });
  });

  describe('GET_GMAIL_STATUS', () => {
    it('returns connected with email when token is valid', async () => {
      mockTokenSuccess('tok_abc');
      mockFetch.mockResolvedValueOnce(userinfoOkResponse('alice@gmail.com'));

      const result = (await sendMessage({ type: 'GET_GMAIL_STATUS' })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'GMAIL_STATUS');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.connected).toBe(true);
      expect(payload.email).toBe('alice@gmail.com');
    });

    it('returns disconnected when no token', async () => {
      mockTokenFailure('No token');

      const result = (await sendMessage({ type: 'GET_GMAIL_STATUS' })) as Record<string, unknown>;

      const payload = result.payload as Record<string, unknown>;
      expect(payload.connected).toBe(false);
    });
  });

  describe('CONNECT_GMAIL', () => {
    it('returns success with email on interactive auth', async () => {
      mockTokenSuccess('tok_new');
      mockFetch.mockResolvedValueOnce(userinfoOkResponse('bob@gmail.com'));

      const result = (await sendMessage({ type: 'CONNECT_GMAIL' })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'GMAIL_CONNECTED');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(true);
      expect(payload.email).toBe('bob@gmail.com');
    });

    it('returns error when user declines consent', async () => {
      mockTokenFailure('The user did not approve access.');

      const result = (await sendMessage({ type: 'CONNECT_GMAIL' })) as Record<string, unknown>;

      const payload = result.payload as Record<string, unknown>;
      expect(payload.success).toBe(false);
      expect(payload.error).toContain('did not approve');
    });
  });

  describe('DISCONNECT_GMAIL', () => {
    it('returns GMAIL_DISCONNECTED', async () => {
      mockTokenSuccess('tok_old');

      const result = (await sendMessage({ type: 'DISCONNECT_GMAIL' })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'GMAIL_DISCONNECTED');
      expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'tok_old' });
    });
  });

  describe('Unknown message type', () => {
    it('returns ERROR for unrecognized message type', async () => {
      const result = (await sendMessage({ type: 'UNKNOWN_TYPE' })) as Record<string, unknown>;

      expect(result).toHaveProperty('type', 'ERROR');
      const payload = result.payload as Record<string, unknown>;
      expect(payload.error).toBe('Unknown message type');
    });
  });
});
