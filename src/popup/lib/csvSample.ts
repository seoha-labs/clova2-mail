/** Filename used when the user downloads the sample recipient CSV. */
export const SAMPLE_CSV_FILENAME = 'recipients-sample.csv';

/**
 * A minimal, valid sample CSV demonstrating the expected columns: a header row
 * with `email` (required) and `name` (optional), followed by example rows.
 * Kept in sync with the importer by csvSample.test.ts.
 */
export function sampleCsvContent(): string {
  return ['name,email', '홍길동,hong@example.com', '김철수,kim@example.com', ''].join('\n');
}
