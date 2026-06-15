import type { StorageSchema, Recipient, RecipientGroup, EmailTemplate, SentEmail } from './types';
import { DEFAULT_TEMPLATE, OPENAI_MODEL, AVAILABLE_MODELS } from './constants';
import { makeSentEmail, appendToBuffer, removeFromBuffer } from './historyBuffer';
import type { MakeSentEmailInput } from './historyBuffer';

type StorageKey = keyof StorageSchema;

async function get<K extends StorageKey>(key: K): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StorageSchema[K] | undefined;
}

async function set<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getOpenAIKey(): Promise<string> {
  return (await get('openaiApiKey')) ?? '';
}

export async function setOpenAIKey(key: string): Promise<void> {
  await set('openaiApiKey', key);
}

export async function getRecipients(): Promise<readonly Recipient[]> {
  return (await get('recipients')) ?? [];
}

export async function setRecipients(recipients: readonly Recipient[]): Promise<void> {
  await set('recipients', recipients);
}

export async function getRecipientGroups(): Promise<readonly RecipientGroup[]> {
  return (await get('recipientGroups')) ?? [];
}

export async function setRecipientGroups(groups: readonly RecipientGroup[]): Promise<void> {
  await set('recipientGroups', groups);
}

function newTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Legacy (pre-v1.6) single-template shape stored under the `emailTemplate` key.
interface LegacyEmailTemplate {
  readonly subject: string;
  readonly body: string;
}

// Idempotent: if a legacy single `emailTemplate` exists and the new
// `emailTemplates` array does not, seed the array from it, set the active id,
// persist both, and drop the legacy key. Returns the migrated array or null.
async function migrateLegacyTemplate(): Promise<readonly EmailTemplate[] | null> {
  const existing = await get('emailTemplates');
  if (existing !== undefined) return null;

  const legacyResult = await chrome.storage.local.get('emailTemplate');
  const legacy = legacyResult['emailTemplate'] as LegacyEmailTemplate | undefined;
  if (!legacy) return null;

  const seeded: EmailTemplate = {
    id: newTemplateId(),
    name: '기본',
    subject: legacy.subject,
    body: legacy.body,
  };
  const templates: readonly EmailTemplate[] = [seeded];
  await set('emailTemplates', templates);
  await set('activeTemplateId', seeded.id);
  await chrome.storage.local.remove('emailTemplate');
  return templates;
}

export async function getEmailTemplates(): Promise<readonly EmailTemplate[]> {
  const migrated = await migrateLegacyTemplate();
  if (migrated) return migrated;
  return (await get('emailTemplates')) ?? [DEFAULT_TEMPLATE];
}

export async function setEmailTemplates(templates: readonly EmailTemplate[]): Promise<void> {
  await set('emailTemplates', templates);
}

export async function getActiveTemplateId(): Promise<string> {
  await migrateLegacyTemplate();
  return (await get('activeTemplateId')) ?? DEFAULT_TEMPLATE.id;
}

export async function setActiveTemplateId(id: string): Promise<void> {
  await set('activeTemplateId', id);
}

// Resolves the active template; falls back to the first template when the
// active id is missing/unknown, and to DEFAULT_TEMPLATE when none exist.
export async function getActiveTemplate(): Promise<EmailTemplate> {
  const templates = await getEmailTemplates();
  if (templates.length === 0) return DEFAULT_TEMPLATE;
  const activeId = await getActiveTemplateId();
  return templates.find((t) => t.id === activeId) ?? templates[0];
}

export function resolveModel(candidate: string | undefined): string {
  const known = AVAILABLE_MODELS.some((m) => m.id === candidate);
  return known ? (candidate as string) : OPENAI_MODEL;
}

export async function getModel(): Promise<string> {
  return resolveModel(await get('model'));
}

export async function setModel(model: string): Promise<void> {
  await set('model', resolveModel(model));
}

export async function getSendHistory(): Promise<readonly SentEmail[]> {
  return (await get('sendHistory')) ?? [];
}

/** Payload for a new history entry; id + sentAt are generated here. */
export type AppendHistoryInput = Omit<MakeSentEmailInput, 'id' | 'sentAt'>;

/**
 * Builds a SentEmail (generating id + sentAt) and writes the trimmed,
 * quota-guarded history back. Returns the created entry. In tests, stub
 * Date.now() and Math.random() for determinism.
 */
export async function appendSendHistory(input: AppendHistoryInput): Promise<SentEmail> {
  const sentAt = Date.now();
  const id = `${sentAt}-${Math.random().toString(36).slice(2, 10)}`;
  const entry = makeSentEmail({ ...input, id, sentAt });
  const current = await getSendHistory();
  const next = appendToBuffer(current, entry);
  await set('sendHistory', next as StorageSchema['sendHistory']);
  return entry;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const current = await getSendHistory();
  const next = removeFromBuffer(current, id);
  await set('sendHistory', next as StorageSchema['sendHistory']);
}

export async function clearSendHistory(): Promise<void> {
  await set('sendHistory', []);
}
