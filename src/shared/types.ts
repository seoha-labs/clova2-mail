export interface Recipient {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface EmailTemplate {
  readonly subject: string;
  readonly body: string;
}

export interface StorageSchema {
  readonly openaiApiKey: string;
  readonly recipients: readonly Recipient[];
  readonly recipientGroups: readonly RecipientGroup[];
  readonly emailTemplate: EmailTemplate;
}

export interface ExtractedData {
  readonly title: string;
  readonly transcript: string;
  readonly attendees: readonly string[];
  readonly duration?: string;
  readonly date?: string;
}

export interface SummaryJson {
  readonly summary_bullets: readonly string[];
  readonly decisions: readonly string[];
  readonly action_items: readonly {
    readonly task: string;
    readonly assignee: string;
    readonly deadline: string;
  }[];
  readonly discussions: readonly string[];
  readonly inferred_variables?: Readonly<Record<string, string>>;
}

export interface SummaryResult {
  readonly subject: string;
  readonly htmlBody: string;
  readonly plainBody: string;
}

export type ModalState =
  | 'IDLE'
  | 'EXTRACTING'
  | 'EXTRACT_FAILED'
  | 'RAW_DATA_PREVIEW'
  | 'MANUAL_INPUT'
  | 'LOADING'
  | 'PREVIEW'
  | 'SENDING'
  | 'SENT'
  | 'ERROR';

export interface ProgressInfo {
  readonly current: number;
  readonly total: number;
}

export interface RecipientGroup {
  readonly id: string;
  readonly name: string;
  readonly recipientIds: readonly string[];
}

export type SendMode = 'summarize' | 'raw';
