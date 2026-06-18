import { describe, it, expect } from 'vitest';
import {
  emptySelection,
  recipientIdsForEmails,
  fieldEmptyMessage,
} from '../../src/content/modal/recipientDefaults';

describe('fieldEmptyMessage', () => {
  it('prompts to add recipients when nothing is saved', () => {
    expect(fieldEmptyMessage('받는 사람', false)).toBe('수신자를 추가해주세요');
  });

  it('says nothing selected when recipients exist but none chosen', () => {
    expect(fieldEmptyMessage('받는 사람', true)).toBe('받는 사람 대상 없음');
    expect(fieldEmptyMessage('참조(CC)', true)).toBe('참조(CC) 대상 없음');
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
