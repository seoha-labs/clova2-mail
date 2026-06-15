/** Per-entry cap on bodyHtml: 256 KB of UTF-8 bytes. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Visible marker appended when a body is truncated (Korean UI). */
const TRUNCATION_MARKER = '\n\n<p>… [내용이 잘렸습니다]</p>';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface TruncateResult {
  readonly bodyHtml: string;
  readonly truncated: boolean;
}

/**
 * Caps bodyHtml at MAX_BODY_BYTES UTF-8 bytes. When over the cap, cuts at a
 * byte boundary that never splits a multibyte char (TextDecoder with
 * { stream:false } drops a trailing partial sequence rather than emitting
 * U+FFFD when we slice on a clean boundary) and appends a visible marker.
 */
export function truncateBody(bodyHtml: string): TruncateResult {
  const bytes = encoder.encode(bodyHtml);
  if (bytes.length <= MAX_BODY_BYTES) {
    return { bodyHtml, truncated: false };
  }
  const markerBytes = encoder.encode(TRUNCATION_MARKER).length;
  const budget = MAX_BODY_BYTES - markerBytes;
  // Decode a prefix; `decoder.decode` on a non-streaming call replaces a
  // trailing partial multibyte sequence, so trim back to a clean boundary.
  const cut = budget;
  let head = decoder.decode(bytes.subarray(0, cut));
  // Drop a trailing replacement char if the slice landed mid-codepoint.
  if (head.endsWith('�')) {
    head = head.slice(0, -1);
  }
  return { bodyHtml: head + TRUNCATION_MARKER, truncated: true };
}
