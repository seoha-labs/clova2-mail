import type { ProgressInfo } from './types';

// Content Script → Background
export interface ExtractAndSummarizeRequest {
  readonly type: 'EXTRACT_AND_SUMMARIZE';
  readonly payload: {
    readonly transcript: string;
    readonly meetingTitle: string;
    readonly attendees?: readonly string[];
  };
}

export interface SummarizeSuccessResponse {
  readonly type: 'SUMMARIZE_RESULT';
  readonly payload: {
    readonly success: true;
    readonly subject: string;
    readonly htmlBody: string;
    readonly plainBody: string;
  };
}

export interface SummarizeErrorResponse {
  readonly type: 'SUMMARIZE_RESULT';
  readonly payload: {
    readonly success: false;
    readonly error: 'TOKEN_LIMIT_EXCEEDED' | 'API_ERROR' | 'PARSE_ERROR';
    readonly message: string;
    readonly tokenCount?: number;
  };
}

export type SummarizeResponse = SummarizeSuccessResponse | SummarizeErrorResponse;

export interface SendEmailRequest {
  readonly type: 'SEND_EMAIL';
  readonly payload: {
    readonly to: readonly string[];
    readonly subject: string;
    readonly htmlBody: string;
  };
}

export interface SendEmailResponse {
  readonly type: 'EMAIL_SENT';
  readonly payload: {
    readonly success: boolean;
    readonly messageId?: string;
    readonly error?: string;
  };
}

export interface GetGmailStatusRequest {
  readonly type: 'GET_GMAIL_STATUS';
}

export interface GetGmailStatusResponse {
  readonly type: 'GMAIL_STATUS';
  readonly payload: {
    readonly connected: boolean;
    readonly email?: string;
  };
}

export interface ConnectGmailRequest {
  readonly type: 'CONNECT_GMAIL';
}

export interface ConnectGmailResponse {
  readonly type: 'GMAIL_CONNECTED';
  readonly payload: {
    readonly success: boolean;
    readonly email?: string;
    readonly error?: string;
  };
}

export interface DisconnectGmailRequest {
  readonly type: 'DISCONNECT_GMAIL';
}

export interface ProgressMessage {
  readonly type: 'SUMMARIZE_PROGRESS';
  readonly payload: ProgressInfo;
}

export type MessageRequest =
  | ExtractAndSummarizeRequest
  | SendEmailRequest
  | GetGmailStatusRequest
  | ConnectGmailRequest
  | DisconnectGmailRequest;

export type MessageResponse =
  | SummarizeResponse
  | SendEmailResponse
  | GetGmailStatusResponse
  | ConnectGmailResponse;

