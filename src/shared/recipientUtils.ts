import type { Recipient, RecipientGroup } from './types';

export function resolveSelectedEmails(
  selectedGroupIds: ReadonlySet<string>,
  selectedRecipientIds: ReadonlySet<string>,
  groups: readonly RecipientGroup[],
  recipients: readonly Recipient[],
): string[] {
  const emailSet = new Set<string>();

  for (const gid of selectedGroupIds) {
    const group = groups.find((g) => g.id === gid);
    if (!group) continue;
    for (const rid of group.recipientIds) {
      const r = recipients.find((rec) => rec.id === rid);
      if (r) emailSet.add(r.email);
    }
  }

  for (const rid of selectedRecipientIds) {
    const r = recipients.find((rec) => rec.id === rid);
    if (r) emailSet.add(r.email);
  }

  return [...emailSet];
}
