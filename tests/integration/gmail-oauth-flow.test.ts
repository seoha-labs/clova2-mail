import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chrome API mock ──────────────────────────────────────────────────
const chromeMock = {
  runtime: { lastError: null as { message?: string } | null },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn(),
  },
};

vi.stubGlobal('chrome', chromeMock);

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getGmailToken,
  fetchGmailEmail,
  checkGmailStatus,
  connectGmail,
  disconnectGmail,
  sendViaGmail,
} from '../../src/background/gmail';

// ── Helpers ──────────────────────────────────────────────────────────

function userinfoOk(email = 'user@gmail.com') {
  return new Response(JSON.stringify({ email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function gmailSendOk(id = 'msg_001') {
  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function gmailSendError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

describe('Gmail OAuth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeMock.runtime.lastError = null;
  });

  describe('getGmailToken', () => {
    it('resolves with token on success (object result)', async () => {
      mockTokenSuccess('tok_abc');
      const token = await getGmailToken(false);
      expect(token).toBe('tok_abc');
    });

    it('resolves with token when result is a string', async () => {
      chromeMock.identity.getAuthToken.mockImplementation(
        (_opts: unknown, cb: (result: string) => void) => {
          chromeMock.runtime.lastError = null;
          cb('tok_string');
        },
      );
      const token = await getGmailToken(false);
      expect(token).toBe('tok_string');
    });

    it('rejects when lastError is set', async () => {
      mockTokenFailure('Not signed in');
      await expect(getGmailToken(false)).rejects.toThrow('Not signed in');
    });

    it('rejects when no token is returned', async () => {
      chromeMock.identity.getAuthToken.mockImplementation(
        (_opts: unknown, cb: (result: null) => void) => {
          chromeMock.runtime.lastError = null;
          cb(null);
        },
      );
      await expect(getGmailToken(true)).rejects.toThrow('No token returned');
    });

    it('passes interactive flag correctly', async () => {
      mockTokenSuccess('tok_interactive');
      await getGmailToken(true);
      expect(chromeMock.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function),
      );
    });
  });

  describe('fetchGmailEmail', () => {
    it('returns email on success', async () => {
      mockFetch.mockResolvedValueOnce(userinfoOk('alice@gmail.com'));
      const email = await fetchGmailEmail('tok_123');
      expect(email).toBe('alice@gmail.com');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(new Response('', { status: 401 }));
      const email = await fetchGmailEmail('bad_token');
      expect(email).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const email = await fetchGmailEmail('tok_123');
      expect(email).toBeNull();
    });

    it('returns null when response has no email field', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'Alice' }), { status: 200 }),
      );
      const email = await fetchGmailEmail('tok_123');
      expect(email).toBeNull();
    });
  });

  describe('checkGmailStatus', () => {
    it('returns connected=true with email when authenticated', async () => {
      mockTokenSuccess('tok_check');
      mockFetch.mockResolvedValueOnce(userinfoOk('bob@gmail.com'));

      const status = await checkGmailStatus();
      expect(status.connected).toBe(true);
      expect(status.email).toBe('bob@gmail.com');
    });

    it('returns connected=false when token fails', async () => {
      mockTokenFailure('No token');
      const status = await checkGmailStatus();
      expect(status.connected).toBe(false);
      expect(status.email).toBeUndefined();
    });

    it('returns connected=true without email when userinfo fails', async () => {
      mockTokenSuccess('tok_check');
      mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }));

      const status = await checkGmailStatus();
      expect(status.connected).toBe(true);
      expect(status.email).toBeUndefined();
    });
  });

  describe('connectGmail', () => {
    it('returns success with email on interactive auth', async () => {
      mockTokenSuccess('tok_new');
      mockFetch.mockResolvedValueOnce(userinfoOk('charlie@gmail.com'));

      const result = await connectGmail();
      expect(result.success).toBe(true);
      expect(result.email).toBe('charlie@gmail.com');
    });

    it('returns error when user denies access', async () => {
      mockTokenFailure('The user did not approve access.');
      const result = await connectGmail();
      expect(result.success).toBe(false);
      expect(result.error).toContain('did not approve');
    });
  });

  describe('disconnectGmail', () => {
    it('removes cached auth token', async () => {
      mockTokenSuccess('tok_old');
      await disconnectGmail();
      expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'tok_old' });
    });

    it('does not throw when already disconnected', async () => {
      mockTokenFailure('No token');
      await expect(disconnectGmail()).resolves.toBeUndefined();
    });
  });

  describe('sendViaGmail', () => {
    it('sends email and returns messageId on success', async () => {
      mockTokenSuccess('tok_send');
      mockFetch.mockResolvedValueOnce(gmailSendOk('msg_xyz'));

      const result = await sendViaGmail(['test@example.com'], 'Subject', '<p>Body</p>');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_xyz');
    });

    it('returns error on Gmail API 403', async () => {
      mockTokenSuccess('tok_send');
      mockFetch.mockResolvedValueOnce(gmailSendError(403, 'Insufficient Permission'));

      const result = await sendViaGmail(['a@b.com'], 'S', '<p>B</p>');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient Permission');
    });

    it('returns error on Gmail API 429 (rate limit)', async () => {
      mockTokenSuccess('tok_send');
      mockFetch.mockResolvedValueOnce(gmailSendError(429, 'Rate Limit Exceeded'));

      const result = await sendViaGmail(['a@b.com'], 'S', '<p>B</p>');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate Limit Exceeded');
    });

    it('returns error on network failure', async () => {
      mockTokenSuccess('tok_send');
      mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

      const result = await sendViaGmail(['a@b.com'], 'S', '<p>B</p>');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('returns error when auth token fails', async () => {
      mockTokenFailure('Session expired');

      const result = await sendViaGmail(['a@b.com'], 'S', '<p>B</p>');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Session expired');
    });

    it('sends correct Authorization header and MIME body', async () => {
      mockTokenSuccess('tok_verify');
      mockFetch.mockResolvedValueOnce(gmailSendOk());

      await sendViaGmail(['x@y.com'], 'Hi', '<p>World</p>');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('gmail'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_verify',
            'Content-Type': 'application/json',
          }),
        }),
      );

      // Verify body contains base64url encoded raw message
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.raw).toBeDefined();
      expect(typeof body.raw).toBe('string');
      // base64url should not contain +, /, or =
      expect(body.raw).not.toMatch(/[+/=]/);
    });
  });
});
