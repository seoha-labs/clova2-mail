import type { SentEmail, SendMode } from './types';

/** Per-entry cap on bodyHtml: 256 KB of UTF-8 bytes. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Visible marker appended when a body is truncated (Korean UI). */
const TRUNCATION_MARKER = '\n\n<p>… [내용이 잘렸습니다]</p>';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface TruncateResult {
  readonly bodyHtml: string;
  readonly truncated: boolean;
}

/**
 * Caps bodyHtml at MAX_BODY_BYTES UTF-8 bytes. When over the cap, backs the
 * cut point off any UTF-8 continuation bytes (0x80–0xBF) so the prefix ends on
 * a complete codepoint — never splitting a multibyte char and never relying on
 * a U+FFFD heuristic — then appends a visible marker.
 */
export function truncateBody(bodyHtml: string): TruncateResult {
  const bytes = encoder.encode(bodyHtml);
  if (bytes.length <= MAX_BODY_BYTES) {
    return { bodyHtml, truncated: false };
  }
  const markerBytes = encoder.encode(TRUNCATION_MARKER).length;
  const budget = MAX_BODY_BYTES - markerBytes;
  // Back up while the byte at the cut is a continuation byte (10xxxxxx), so the
  // excluded byte starts a fresh codepoint and [0, cut) is a whole-char prefix.
  let cut = budget;
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
  const head = decoder.decode(bytes.subarray(0, cut));
  return { bodyHtml: head + TRUNCATION_MARKER, truncated: true };
}

export interface MakeSentEmailInput {
  readonly id: string;
  readonly sentAt: number;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
  readonly subject: string;
  readonly bodyHtml: string;
  readonly mode: SendMode;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Builds an immutable SentEmail. cc/bcc default to [] when absent (Epic A may
 * not be present). Determinism: id + sentAt are injected by the caller, never
 * generated here, so tests pass fixed values.
 */
export function makeSentEmail(input: MakeSentEmailInput): SentEmail {
  const { bodyHtml, truncated } = truncateBody(input.bodyHtml);
  const base: SentEmail = {
    id: input.id,
    sentAt: input.sentAt,
    to: [...input.to],
    cc: input.cc ? [...input.cc] : [],
    bcc: input.bcc ? [...input.bcc] : [],
    subject: input.subject,
    bodyHtml,
    mode: input.mode,
    success: input.success,
    truncated,
  };
  return input.error === undefined ? base : { ...base, error: input.error };
}

/** Ring-buffer length cap. */
export const MAX_HISTORY_ENTRIES = 50;

/**
 * Total serialized-history byte budget. chrome.storage.local allows ~5MB
 * across all keys; reserve a conservative slice for the history key so other
 * keys (recipients, templates) keep headroom.
 */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const totalEncoder = new TextEncoder();

function serializedBytes(history: readonly SentEmail[]): number {
  return totalEncoder.encode(JSON.stringify(history)).length;
}

/**
 * Returns a NEW history array with `entry` prepended (newest first), trimmed to
 * MAX_HISTORY_ENTRIES, then trimmed further by dropping the oldest (tail) until
 * the serialized size fits MAX_TOTAL_BYTES. The newest entry is never dropped.
 */
export function appendToBuffer(
  history: readonly SentEmail[],
  entry: SentEmail,
): readonly SentEmail[] {
  let next: SentEmail[] = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
  // Drop oldest until it fits, but always keep at least the newest entry.
  while (next.length > 1 && serializedBytes(next) > MAX_TOTAL_BYTES) {
    next = next.slice(0, -1);
  }
  return next;
}

/** Returns a NEW history array with the entry matching `id` removed. */
export function removeFromBuffer(
  history: readonly SentEmail[],
  id: string,
): readonly SentEmail[] {
  return history.filter((e) => e.id !== id);
}
