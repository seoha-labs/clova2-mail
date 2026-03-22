import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chrome storage mock ──────────────────────────────────────────────
const storageStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
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

import {
  getOpenAIKey,
  setOpenAIKey,
  getRecipients,
  setRecipients,
  getEmailTemplate,
  setEmailTemplate,
} from '../../src/shared/storage';
import { DEFAULT_TEMPLATE } from '../../src/shared/constants';
import type { Recipient, EmailTemplate } from '../../src/shared/types';

describe('Chrome storage wrapper operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  describe('OpenAI key', () => {
    it('returns empty string when key is not set', async () => {
      const key = await getOpenAIKey();
      expect(key).toBe('');
    });

    it('stores and retrieves API key', async () => {
      await setOpenAIKey('sk-test-12345');
      const key = await getOpenAIKey();
      expect(key).toBe('sk-test-12345');
    });

    it('overwrites existing key', async () => {
      await setOpenAIKey('sk-old');
      await setOpenAIKey('sk-new');
      const key = await getOpenAIKey();
      expect(key).toBe('sk-new');
    });
  });

  describe('Recipients', () => {
    it('returns empty array when no recipients set', async () => {
      const recipients = await getRecipients();
      expect(recipients).toEqual([]);
    });

    it('stores and retrieves recipients', async () => {
      const testRecipients: readonly Recipient[] = [
        { id: '1', email: 'alice@test.com', name: 'Alice' },
        { id: '2', email: 'bob@test.com', name: 'Bob' },
      ];
      await setRecipients(testRecipients);
      const result = await getRecipients();
      expect(result).toEqual(testRecipients);
    });

    it('overwrites existing recipients (immutable update)', async () => {
      await setRecipients([{ id: '1', email: 'old@test.com', name: 'Old' }]);
      const newRecipients: readonly Recipient[] = [
        { id: '2', email: 'new@test.com', name: 'New' },
      ];
      await setRecipients(newRecipients);
      const result = await getRecipients();
      expect(result).toEqual(newRecipients);
      expect(result).toHaveLength(1);
    });
  });

  describe('Email template', () => {
    it('returns DEFAULT_TEMPLATE when not set', async () => {
      const template = await getEmailTemplate();
      expect(template).toEqual(DEFAULT_TEMPLATE);
    });

    it('stores and retrieves custom template', async () => {
      const custom: EmailTemplate = {
        subject: 'Custom: {title}',
        body: 'Body: {summary}',
      };
      await setEmailTemplate(custom);
      const result = await getEmailTemplate();
      expect(result).toEqual(custom);
    });

    it('reverts to default after clearing', async () => {
      await setEmailTemplate({ subject: 'Custom', body: 'Body' });
      // Simulate clearing by deleting the key
      delete storageStore['emailTemplate'];
      const result = await getEmailTemplate();
      expect(result).toEqual(DEFAULT_TEMPLATE);
    });
  });

  describe('Storage isolation', () => {
    it('setting one key does not affect others', async () => {
      await setOpenAIKey('sk-test');
      await setRecipients([{ id: '1', email: 'a@b.com', name: 'A' }]);

      const key = await getOpenAIKey();
      const recipients = await getRecipients();
      const template = await getEmailTemplate();

      expect(key).toBe('sk-test');
      expect(recipients).toHaveLength(1);
      expect(template).toEqual(DEFAULT_TEMPLATE);
    });
  });
});
