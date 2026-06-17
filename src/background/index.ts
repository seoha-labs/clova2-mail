import type { MessageRequest } from '../shared/messages';
import { summarizeTranscript } from './openai';
import { sendViaGmail, checkGmailStatus, connectGmail, disconnectGmail } from './gmail';
import { EMAIL_REGEX } from '../shared/email';
import { appendSendHistory } from '../shared/storage';
import type { SendMode } from '../shared/types';

async function recordHistoryBestEffort(input: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  bodyHtml: string;
  mode: SendMode;
  success: boolean;
  error?: string;
}): Promise<void> {
  try {
    await appendSendHistory(input);
  } catch (err) {
    // Best-effort: a history write failure must never fail the send.
    console.warn('Send history write failed:', err);
  }
}

const ALLOWED_ORIGINS = ['https://clovanote.naver.com'];

function isAllowedSender(sender: chrome.runtime.MessageSender): boolean {
  // Allow popup (no tab)
  if (!sender.tab) return true;
  // Allow content scripts from expected origins
  return ALLOWED_ORIGINS.some((origin) => sender.tab?.url?.startsWith(origin));
}

chrome.runtime.onMessage.addListener((message: MessageRequest, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ type: 'ERROR', payload: { error: 'Unauthorized sender' } });
    return true;
  }
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ type: 'ERROR', payload: { error: String(err) } });
  });
  return true; // async response
});

async function handleMessage(message: MessageRequest): Promise<unknown> {
  switch (message.type) {
    case 'EXTRACT_AND_SUMMARIZE': {
      try {
        const result = await summarizeTranscript(
          message.payload.transcript,
          message.payload.meetingTitle,
          message.payload.attendees ?? [],
          message.payload.templateId,
        );
        return {
          type: 'SUMMARIZE_RESULT',
          payload: {
            success: true,
            subject: result.subject,
            htmlBody: result.htmlBody,
            plainBody: result.plainBody,
          },
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isTokenError = errorMessage.includes('토큰');
        return {
          type: 'SUMMARIZE_RESULT',
          payload: {
            success: false,
            error: isTokenError ? 'TOKEN_LIMIT_EXCEEDED' : 'API_ERROR',
            message: errorMessage,
          },
        };
      }
    }

    case 'SEND_EMAIL': {
      const { to, cc, bcc, subject, htmlBody } = message.payload;
      const mode: SendMode = message.payload.mode ?? 'summarize';

      // Validate recipients (To is required; Cc/Bcc are optional).
      if (!Array.isArray(to) || to.length === 0) {
        return { type: 'EMAIL_SENT', payload: { success: false, error: '수신자가 없습니다.' } };
      }
      const ccList = Array.isArray(cc) ? cc : [];
      const bccList = Array.isArray(bcc) ? bcc : [];

      // Sanitize CRLF from all header-bound values first (header-injection guard),
      // then validate the sanitized addresses with the same rule as To.
      const safeTo = to.map((addr: string) => addr.replace(/[\r\n]/g, ''));
      const safeCc = ccList.map((addr: string) => addr.replace(/[\r\n]/g, ''));
      const safeBcc = bccList.map((addr: string) => addr.replace(/[\r\n]/g, ''));

      const invalidEmails = [...safeTo, ...safeCc, ...safeBcc].filter(
        (addr: string) => !EMAIL_REGEX.test(addr),
      );
      if (invalidEmails.length > 0) {
        return {
          type: 'EMAIL_SENT',
          payload: { success: false, error: `잘못된 이메일 주소: ${invalidEmails.join(', ')}` },
        };
      }

      const safeSubject = typeof subject === 'string' ? subject.replace(/[\r\n]/g, '') : '';

      const result = await sendViaGmail(safeTo, safeCc, safeBcc, safeSubject, htmlBody);

      await recordHistoryBestEffort({
        to: safeTo,
        cc: safeCc,
        bcc: safeBcc,
        subject: safeSubject,
        bodyHtml: htmlBody,
        mode,
        success: result.success,
        error: result.success ? undefined : result.error,
      });

      return { type: 'EMAIL_SENT', payload: result };
    }

    case 'GET_GMAIL_STATUS': {
      const status = await checkGmailStatus();
      return { type: 'GMAIL_STATUS', payload: status };
    }

    case 'CONNECT_GMAIL': {
      const result = await connectGmail();
      return { type: 'GMAIL_CONNECTED', payload: result };
    }

    case 'DISCONNECT_GMAIL': {
      await disconnectGmail();
      return { type: 'GMAIL_DISCONNECTED' };
    }

    default:
      return { type: 'ERROR', payload: { error: 'Unknown message type' } };
  }
}

