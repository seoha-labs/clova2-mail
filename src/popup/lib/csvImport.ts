import type { Recipient } from '../../shared/types';
import { isValidEmail } from '../../shared/email';

export interface SkippedRow {
  readonly row: number; // 1-based line number in the source CSV (header = row 1)
  readonly reason: string;
}

export interface CsvImportResult {
  readonly added: readonly Recipient[];
  readonly skipped: readonly SkippedRow[];
}

/** Split one CSV line into fields, honoring double-quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Parse a CSV string with a `name,email` header (case-insensitive, any column
 * order). Validates each row's email with the shared EMAIL_REGEX and dedups by
 * lowercased email against existing recipients and within the batch. Bad rows
 * are reported in `skipped`; good rows are returned in `added`. Never throws.
 */
export function parseCsvRecipients(
  csv: string,
  existing: readonly Recipient[],
): CsvImportResult {
  const added: Recipient[] = [];
  const skipped: SkippedRow[] = [];

  // Normalize line endings (CRLF / CR → LF) and split.
  const lines = csv.replace(/\r\n?/g, '\n').split('\n');

  // Find the header (first non-blank line).
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { added, skipped };
  }

  const header = splitCsvLine(lines[headerIndex]).map((h) => h.trim().toLowerCase());
  const emailCol = header.indexOf('email');
  const nameCol = header.indexOf('name');
  if (emailCol === -1) {
    return {
      added,
      skipped: [{ row: headerIndex + 1, reason: 'email 헤더가 없습니다.' }],
    };
  }

  const seenEmails = new Set<string>(existing.map((r) => r.email.toLowerCase()));

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue; // skip blank lines silently

    const fields = splitCsvLine(raw);
    const email = (fields[emailCol] ?? '').trim();
    const name = nameCol === -1 ? '' : (fields[nameCol] ?? '').trim();
    const rowNumber = i + 1;

    if (email === '') {
      skipped.push({ row: rowNumber, reason: '이메일이 비어 있습니다.' });
      continue;
    }
    if (!isValidEmail(email)) {
      skipped.push({ row: rowNumber, reason: `잘못된 이메일 주소: ${email}` });
      continue;
    }

    const key = email.toLowerCase();
    if (seenEmails.has(key)) {
      skipped.push({ row: rowNumber, reason: `중복된 이메일: ${email}` });
      continue;
    }
    seenEmails.add(key);

    added.push({
      id: makeId(),
      email,
      name: name || email.split('@')[0],
    });
  }

  return { added, skipped };
}
