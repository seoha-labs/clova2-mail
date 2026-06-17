import { describe, it, expect } from 'vitest';
import type { Recipient } from '../../src/shared/types';
import { parseCsvRecipients } from '../../src/popup/lib/csvImport';
import type { Recipient as Rec } from '../../src/shared/types';

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

describe('parseCsvRecipients — validation & dedup', () => {
  it('reports invalid emails with 1-based row numbers and keeps good rows', () => {
    const csv = 'name,email\nAlice,alice@test.com\nBad,not-an-email\nBob,bob@test.com';
    const result = parseCsvRecipients(csv, []);

    expect(result.added).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].row).toBe(3); // header=1, alice=2, bad=3
    expect(result.skipped[0].reason).toContain('not-an-email');
  });

  it('dedups against existing recipients (case-insensitive)', () => {
    const existing: readonly Rec[] = [{ id: 'x', email: 'Alice@Test.com', name: 'Alice' }];
    const csv = 'name,email\nAlice2,alice@test.com\nBob,bob@test.com';
    const result = parseCsvRecipients(csv, existing);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].email).toBe('bob@test.com');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('중복');
  });

  it('dedups within the batch (first occurrence wins)', () => {
    const csv = 'name,email\nAlice,alice@test.com\nAliceDup,ALICE@test.com';
    const result = parseCsvRecipients(csv, []);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('Alice');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].row).toBe(3);
  });

  it('returns empty result for an empty / whitespace-only file', () => {
    expect(parseCsvRecipients('', [])).toEqual({ added: [], skipped: [] });
    expect(parseCsvRecipients('   \n  \n', [])).toEqual({ added: [], skipped: [] });
  });

  it('reports a missing email header', () => {
    const csv = 'name,team\nAlice,dev';
    const result = parseCsvRecipients(csv, []);
    expect(result.added).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('email 헤더');
  });
});
