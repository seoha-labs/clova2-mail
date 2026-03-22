import { DEFAULT_RAW_SUBJECT_TEMPLATE, DEFAULT_RAW_BODY_TEMPLATE } from '../../shared/constants';
import { renderSafeHtml, stripHtmlFromTemplate } from '../sanitizer';

export function formatRawTranscriptEmail(
  transcript: string,
  meetingTitle: string,
  attendees: readonly string[],
): { readonly subject: string; readonly htmlBody: string } {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const safeTitle = stripHtmlFromTemplate(meetingTitle).replace(/[\r\n]/g, ' ');
  const subject = DEFAULT_RAW_SUBJECT_TEMPLATE
    .replace('{title}', safeTitle)
    .replace('{date}', date);

  const attendeesStr = attendees.length > 0 ? attendees.join(', ') : '-';

  const bodyMarkdown = DEFAULT_RAW_BODY_TEMPLATE
    .replace('{title}', meetingTitle)
    .replace('{attendees}', attendeesStr)
    .replace('{date}', date)
    .replace('{transcript}', transcript);

  const htmlBody = renderSafeHtml(bodyMarkdown);

  return { subject, htmlBody };
}
