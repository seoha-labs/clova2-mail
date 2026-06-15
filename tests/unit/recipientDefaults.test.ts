import { describe, it, expect } from 'vitest';
import type { Recipient, RecipientGroup } from '../../src/shared/types';
import {
  defaultToSelection,
  emptySelection,
  recipientIdsForEmails,
} from '../../src/content/modal/recipientDefaults';

const recipients: readonly Recipient[] = [
  { id: 'r1', email: 'a@x.com', name: 'Alice' },
  { id: 'r2', email: 'b@x.com', name: 'Bob' },
];
const groups: readonly RecipientGroup[] = [
  { id: 'g1', name: 'Team', recipientIds: ['r1', 'r2'] },
];

describe('defaultToSelection', () => {
  it('selects every recipient id and every group id (To defaults to all)', () => {
    const { groupIds, recipientIds } = defaultToSelection(groups, recipients);
    expect([...groupIds].sort()).toEqual(['g1']);
    expect([...recipientIds].sort()).toEqual(['r1', 'r2']);
  });

  it('returns empty sets when there are no recipients or groups', () => {
    const { groupIds, recipientIds } = defaultToSelection([], []);
    expect(groupIds.size).toBe(0);
    expect(recipientIds.size).toBe(0);
  });
});

describe('emptySelection', () => {
  it('selects nothing (Cc/Bcc default to none)', () => {
    const { groupIds, recipientIds } = emptySelection();
    expect(groupIds.size).toBe(0);
    expect(recipientIds.size).toBe(0);
  });

  it('returns independent set instances on each call (no shared mutable state)', () => {
    const a = emptySelection();
    const b = emptySelection();
    expect(a.groupIds).not.toBe(b.groupIds);
    expect(a.recipientIds).not.toBe(b.recipientIds);
  });
});

describe('recipientIdsForEmails', () => {
  const recipients = [
    { id: 'r1', email: 'a@example.com', name: 'A' },
    { id: 'r2', email: 'B@Example.com', name: 'B' },
    { id: 'r3', email: 'c@example.com', name: 'C' },
  ];

  it('maps emails back to recipient ids (case-insensitive)', () => {
    const ids = recipientIdsForEmails(['a@example.com', 'b@example.com'], recipients);
    expect([...ids].sort()).toEqual(['r1', 'r2']);
  });

  it('drops emails with no matching saved recipient', () => {
    const ids = recipientIdsForEmails(['a@example.com', 'unknown@x.com'], recipients);
    expect([...ids]).toEqual(['r1']);
  });

  it('returns an empty set for no emails', () => {
    expect(recipientIdsForEmails([], recipients).size).toBe(0);
  });
});
