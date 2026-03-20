import type { MessageRequest } from '../shared/messages';
import { summarizeTranscript } from './openai';
import { sendViaGmail, checkGmailStatus, connectGmail, disconnectGmail } from './gmail';

chrome.runtime.onMessage.addListener((message: MessageRequest, _sender, sendResponse) => {
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
      const { to, subject, htmlBody } = message.payload;
      const result = await sendViaGmail(to, subject, htmlBody);
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

