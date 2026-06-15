import type { SendMode } from '../../shared/types';
import { formatRawTranscriptEmail } from './formatRawEmail';

/**
 * The exact shape consumed by the editable PREVIEW state in Modal.tsx.
 * Both raw and summary modes converge on a value of this shape before
 * the user edits and sends.
 */
export interface PreviewModel {
  readonly subject: string;
  readonly htmlBody: string;
  readonly mode: SendMode;
}

/**
 * Builds the preview model for raw mode by forwarding the pure
 * formatter output verbatim. This is the single source of truth that
 * populates the editable subject + body in the modal.
 */
export function buildRawPreview(
  transcript: string,
  meetingTitle: string,
  attendees: readonly string[],
): PreviewModel {
  const { subject, htmlBody } = formatRawTranscriptEmail(transcript, meetingTitle, attendees);
  return { subject, htmlBody, mode: 'raw' };
}
