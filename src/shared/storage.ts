import type { StorageSchema, Recipient, EmailTemplate } from './types';
import { DEFAULT_TEMPLATE } from './constants';

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

export async function getEmailTemplate(): Promise<EmailTemplate> {
  return (await get('emailTemplate')) ?? DEFAULT_TEMPLATE;
}

export async function setEmailTemplate(template: EmailTemplate): Promise<void> {
  await set('emailTemplate', template);
}
