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
