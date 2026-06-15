import type { Recipient, RecipientGroup } from '../../shared/types';

export interface SelectionState {
  readonly groupIds: ReadonlySet<string>;
  readonly recipientIds: ReadonlySet<string>;
}

/** To defaults to everyone: all group ids + all recipient ids selected. */
export function defaultToSelection(
  groups: readonly RecipientGroup[],
  recipients: readonly Recipient[],
): SelectionState {
  return {
    groupIds: new Set(groups.map((g) => g.id)),
    recipientIds: new Set(recipients.map((r) => r.id)),
  };
}

/** Cc/Bcc default to nothing selected. Returns fresh, independent sets. */
export function emptySelection(): SelectionState {
  return { groupIds: new Set<string>(), recipientIds: new Set<string>() };
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
