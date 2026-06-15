import { describe, it, expect } from 'vitest';
import type { Recipient } from '../../src/shared/types';
import { parseCsvRecipients } from '../../src/popup/lib/csvImport';

const noExisting: readonly Recipient[] = [];

describe('parseCsvRecipients — happy path', () => {
  it('parses a header + two rows', () => {
    const csv = 'name,email\nAlice,alice@test.com\nBob,bob@test.com';
    const result = parseCsvRecipients(csv, noExisting);

    expect(result.skipped).toEqual([]);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
    expect(result.added[1]).toMatchObject({ name: 'Bob', email: 'bob@test.com' });
  });

  it('assigns a unique id to each added recipient', () => {
    const csv = 'name,email\nAlice,alice@test.com\nBob,bob@test.com';
    const result = parseCsvRecipients(csv, noExisting);

    const ids = result.added.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('accepts a case-insensitive header (Email,Name order)', () => {
    const csv = 'Email,Name\nalice@test.com,Alice';
    const result = parseCsvRecipients(csv, noExisting);

    expect(result.skipped).toEqual([]);
    expect(result.added[0]).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
  });
});
