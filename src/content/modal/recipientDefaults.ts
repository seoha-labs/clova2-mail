import type { Recipient } from '../../shared/types';

export interface SelectionState {
  readonly groupIds: ReadonlySet<string>;
  readonly recipientIds: ReadonlySet<string>;
}

/** Every field (To/Cc/Bcc) defaults to nothing selected. Returns fresh, independent sets. */
export function emptySelection(): SelectionState {
  return { groupIds: new Set<string>(), recipientIds: new Set<string>() };
}

/**
 * Message shown when a field has no resolved recipients. With no saved
 * recipients/groups at all, prompt the user to add some (the send modal can
 * only pick from saved entries). Otherwise just note nothing is selected.
 */
export function fieldEmptyMessage(label: string, hasSavedData: boolean): string {
  return hasSavedData ? `${label} 대상 없음` : '수신자를 추가해주세요';
}

/**
 * Map a list of emails back to saved recipient ids (case-insensitive).
 * Used to re-seed the selector on re-send. Emails with no matching saved
 * recipient are dropped (they cannot be represented as a chip).
 */
export function recipientIdsForEmails(
  emails: readonly string[],
  recipients: readonly Recipient[],
): Set<string> {
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  return new Set(
    recipients.filter((r) => wanted.has(r.email.toLowerCase())).map((r) => r.id),
  );
}
