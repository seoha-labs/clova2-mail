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

describe('parseCsvRecipients — formatting variations', () => {
  it('trims surrounding whitespace on fields', () => {
    const csv = 'name,email\n  Alice  ,  alice@test.com  ';
    const result = parseCsvRecipients(csv, []);
    expect(result.added[0]).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'name,email\n"Lee, Alice",alice@test.com';
    const result = parseCsvRecipients(csv, []);
    expect(result.skipped).toEqual([]);
    expect(result.added[0]).toMatchObject({ name: 'Lee, Alice', email: 'alice@test.com' });
  });

  it('handles escaped double quotes inside a quoted field', () => {
    const csv = 'name,email\n"Al ""The Boss"" Smith",al@test.com';
    const result = parseCsvRecipients(csv, []);
    expect(result.added[0]).toMatchObject({ name: 'Al "The Boss" Smith', email: 'al@test.com' });
  });

  it('falls back to the email local-part when name is missing', () => {
    const csv = 'name,email\n,alice@test.com';
    const result = parseCsvRecipients(csv, []);
    expect(result.added[0]).toMatchObject({ name: 'alice', email: 'alice@test.com' });
  });

  it('handles an email-only CSV (no name column)', () => {
    const csv = 'email\nalice@test.com\nbob@test.com';
    const result = parseCsvRecipients(csv, []);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]).toMatchObject({ name: 'alice', email: 'alice@test.com' });
  });

  it('parses CRLF line endings', () => {
    const csv = 'name,email\r\nAlice,alice@test.com\r\nBob,bob@test.com\r\n';
    const result = parseCsvRecipients(csv, []);
    expect(result.added).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it('ignores a trailing newline and interior blank lines', () => {
    const csv = 'name,email\nAlice,alice@test.com\n\nBob,bob@test.com\n';
    const result = parseCsvRecipients(csv, []);
    expect(result.added).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });
});
