import { describe, it, expect } from 'vitest';
import { SAMPLE_CSV_FILENAME, sampleCsvContent } from '../../src/popup/lib/csvSample';
import { parseCsvRecipients } from '../../src/popup/lib/csvImport';

describe('csvSample', () => {
  it('exposes a .csv filename', () => {
    expect(SAMPLE_CSV_FILENAME.endsWith('.csv')).toBe(true);
  });

  it('starts with a name,email header row', () => {
    expect(sampleCsvContent().split('\n')[0]).toBe('name,email');
  });

  it('is valid input for the real CSV importer (every row imports cleanly)', () => {
    const result = parseCsvRecipients(sampleCsvContent(), []);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.skipped).toEqual([]);
  });
});
