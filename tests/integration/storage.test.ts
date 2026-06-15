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
      remove: vi.fn((key: string) => {
        delete storageStore[key];
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
  getRecipientGroups,
  setRecipientGroups,
  getEmailTemplates,
  setEmailTemplates,
  getActiveTemplateId,
  setActiveTemplateId,
  getActiveTemplate,
  getSendHistory,
  appendSendHistory,
  deleteHistoryEntry,
  clearSendHistory,
  getPendingResend,
  setPendingResend,
  clearPendingResend,
} from '../../src/shared/storage';
import { MAX_HISTORY_ENTRIES } from '../../src/shared/historyBuffer';
import { DEFAULT_TEMPLATE } from '../../src/shared/constants';
import type {
  Recipient,
  RecipientGroup,
  EmailTemplate,
  SentEmail,
  PendingResend,
} from '../../src/shared/types';

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

  describe('Email templates (array)', () => {
    it('seeds [DEFAULT_TEMPLATE] when nothing is set', async () => {
      const templates = await getEmailTemplates();
      expect(templates).toEqual([DEFAULT_TEMPLATE]);
    });

    it('defaults activeTemplateId to DEFAULT_TEMPLATE.id when nothing is set', async () => {
      const id = await getActiveTemplateId();
      expect(id).toBe(DEFAULT_TEMPLATE.id);
    });

    it('stores and retrieves a custom template array', async () => {
      const custom: readonly EmailTemplate[] = [
        { id: 'a', name: '영업', subject: 'S {title}', body: 'B {summary_bullets}' },
        { id: 'b', name: '내부', subject: 'S2', body: 'B2' },
      ];
      await setEmailTemplates(custom);
      const result = await getEmailTemplates();
      expect(result).toEqual(custom);
    });

    it('stores and retrieves activeTemplateId', async () => {
      await setActiveTemplateId('b');
      const id = await getActiveTemplateId();
      expect(id).toBe('b');
    });

    it('getActiveTemplate returns the template matching activeTemplateId', async () => {
      const custom: readonly EmailTemplate[] = [
        { id: 'a', name: '영업', subject: 'Sa', body: 'Ba' },
        { id: 'b', name: '내부', subject: 'Sb', body: 'Bb' },
      ];
      await setEmailTemplates(custom);
      await setActiveTemplateId('b');
      const active = await getActiveTemplate();
      expect(active.id).toBe('b');
    });

    it('getActiveTemplate falls back to the first template when activeTemplateId is missing', async () => {
      const custom: readonly EmailTemplate[] = [
        { id: 'a', name: '영업', subject: 'Sa', body: 'Ba' },
        { id: 'b', name: '내부', subject: 'Sb', body: 'Bb' },
      ];
      await setEmailTemplates(custom);
      await setActiveTemplateId('does-not-exist');
      const active = await getActiveTemplate();
      expect(active.id).toBe('a');
    });
  });

  describe('Legacy emailTemplate migration', () => {
    it('migrates a legacy single emailTemplate into the array and sets active', async () => {
      // Simulate pre-v1.6 storage shape (no id/name on the legacy object).
      storageStore['emailTemplate'] = { subject: '[옛] {title}', body: '옛 본문' };

      const templates = await getEmailTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('기본');
      expect(templates[0].subject).toBe('[옛] {title}');
      expect(templates[0].body).toBe('옛 본문');
      expect(typeof templates[0].id).toBe('string');
      expect(templates[0].id.length).toBeGreaterThan(0);

      const activeId = await getActiveTemplateId();
      expect(activeId).toBe(templates[0].id);
    });

    it('persists the migration so a second read returns the same id (idempotent)', async () => {
      storageStore['emailTemplate'] = { subject: 'leg', body: 'legbody' };

      const first = await getEmailTemplates();
      const firstId = first[0].id;
      const firstActive = await getActiveTemplateId();

      const second = await getEmailTemplates();
      const secondActive = await getActiveTemplateId();

      expect(second).toEqual(first);
      expect(second[0].id).toBe(firstId);
      expect(secondActive).toBe(firstActive);
    });

    it('removes the legacy emailTemplate key after migration', async () => {
      storageStore['emailTemplate'] = { subject: 'leg', body: 'legbody' };
      await getEmailTemplates();
      expect(storageStore['emailTemplate']).toBeUndefined();
    });

    it('does not migrate when emailTemplates already exists', async () => {
      storageStore['emailTemplate'] = { subject: 'leg', body: 'legbody' };
      storageStore['emailTemplates'] = [
        { id: 'keep', name: '유지', subject: 'k', body: 'kb' },
      ];
      const templates = await getEmailTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('keep');
    });
  });

  describe('Recipient groups', () => {
    it('returns empty array when no groups set', async () => {
      const groups = await getRecipientGroups();
      expect(groups).toEqual([]);
    });

    it('stores and retrieves groups', async () => {
      const testGroups: readonly RecipientGroup[] = [
        { id: 'g1', name: '개발팀', recipientIds: ['1', '2'] },
        { id: 'g2', name: '기획팀', recipientIds: ['3'] },
      ];
      await setRecipientGroups(testGroups);
      const result = await getRecipientGroups();
      expect(result).toEqual(testGroups);
    });

    it('overwrites existing groups', async () => {
      await setRecipientGroups([{ id: 'g1', name: 'Old', recipientIds: ['1'] }]);
      const newGroups: readonly RecipientGroup[] = [
        { id: 'g2', name: 'New', recipientIds: ['2', '3'] },
      ];
      await setRecipientGroups(newGroups);
      const result = await getRecipientGroups();
      expect(result).toEqual(newGroups);
      expect(result).toHaveLength(1);
    });
  });

  describe('Send history', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    });

    it('returns empty array when no history set', async () => {
      expect(await getSendHistory()).toEqual([]);
    });

    it('appends an entry with deterministic id and timestamp', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const entry = await appendSendHistory({
        to: ['a@b.com'],
        subject: '제목',
        bodyHtml: '<p>본문</p>',
        mode: 'summarize',
        success: true,
      });

      expect(entry.sentAt).toBe(1_700_000_000_000);
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);

      const stored = await getSendHistory();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(entry.id);
      expect(stored[0].cc).toEqual([]);
      expect(stored[0].bcc).toEqual([]);

      vi.restoreAllMocks();
    });

    it('prepends newest and trims to MAX_HISTORY_ENTRIES', async () => {
      for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
        await appendSendHistory({
          to: ['a@b.com'],
          subject: `S${i}`,
          bodyHtml: '<p>x</p>',
          mode: 'summarize',
          success: true,
        });
      }
      const stored = await getSendHistory();
      expect(stored).toHaveLength(MAX_HISTORY_ENTRIES);
      expect(stored[0].subject).toBe(`S${MAX_HISTORY_ENTRIES + 4}`); // newest
    });

    it('records a failure entry with the error message', async () => {
      await appendSendHistory({
        to: ['a@b.com'],
        subject: 'S',
        bodyHtml: '<p>x</p>',
        mode: 'raw',
        success: false,
        error: 'HTTP 500',
      });
      const stored = await getSendHistory();
      expect(stored[0].success).toBe(false);
      expect(stored[0].error).toBe('HTTP 500');
    });

    it('deletes a single entry by id', async () => {
      const e1 = await appendSendHistory({
        to: ['a@b.com'], subject: 'A', bodyHtml: '<p>a</p>', mode: 'summarize', success: true,
      });
      await appendSendHistory({
        to: ['a@b.com'], subject: 'B', bodyHtml: '<p>b</p>', mode: 'summarize', success: true,
      });
      await deleteHistoryEntry(e1.id);
      const stored = await getSendHistory();
      expect(stored).toHaveLength(1);
      expect(stored.find((e: SentEmail) => e.id === e1.id)).toBeUndefined();
    });

    it('clears all history', async () => {
      await appendSendHistory({
        to: ['a@b.com'], subject: 'A', bodyHtml: '<p>a</p>', mode: 'summarize', success: true,
      });
      await clearSendHistory();
      expect(await getSendHistory()).toEqual([]);
    });
  });

  describe('Pending re-send hand-off', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    });

    it('returns undefined when nothing is pending', async () => {
      expect(await getPendingResend()).toBeUndefined();
    });

    it('stores and retrieves a pending re-send payload', async () => {
      const payload: PendingResend = {
        to: ['a@b.com'],
        cc: [],
        bcc: [],
        subject: '재발송 제목',
        bodyHtml: '<p>본문</p>',
      };
      await setPendingResend(payload);
      expect(await getPendingResend()).toEqual(payload);
    });

    it('clears the pending re-send payload', async () => {
      await setPendingResend({
        to: ['a@b.com'], cc: [], bcc: [], subject: 'S', bodyHtml: '<p>x</p>',
      });
      await clearPendingResend();
      expect(await getPendingResend()).toBeUndefined();
    });
  });

  describe('Storage isolation', () => {
    it('setting one key does not affect others', async () => {
      await setOpenAIKey('sk-test');
      await setRecipients([{ id: '1', email: 'a@b.com', name: 'A' }]);

      const key = await getOpenAIKey();
      const recipients = await getRecipients();
      const templates = await getEmailTemplates();

      expect(key).toBe('sk-test');
      expect(recipients).toHaveLength(1);
      expect(templates).toEqual([DEFAULT_TEMPLATE]);
    });
  });
});
