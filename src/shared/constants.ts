import type { EmailTemplate } from './types';

export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODEL = 'gpt-4o-mini';
export const GMAIL_SEND_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const MAX_TOKENS_SINGLE = 50_000;
export const MAX_TOKENS_CHUNK = 100_000;
export const CHUNK_SIZE = 30_000;
export const MIN_TRANSCRIPT_LENGTH = 50;

export const SYSTEM_PROMPT = `당신은 기업 회의록 요약 전문가입니다.
사용자가 제공하는 회의 원문(transcript)을 분석하여
주어진 JSON 스키마에 맞게 구조화된 요약을 생성하세요.

규칙:
1. 핵심 내용만 간결하게 요약 (3~5문장)
2. 결정사항은 구체적으로 기술 (누가, 무엇을, 언제)
3. Action Item에는 반드시 담당자와 기한을 명시
4. 불필요한 인사말, 잡담은 제외
5. 한국어로 작성
6. 반드시 JSON 형식으로 응답

응답 JSON 스키마:
{
  "summary": "회의 전체 요약 (3~5문장)",
  "decisions": ["결정사항 1", "결정사항 2"],
  "action_items": [
    { "task": "태스크 내용", "assignee": "담당자", "deadline": "기한" }
  ],
  "attendees": ["참석자1", "참석자2"],
  "keywords": ["키워드1", "키워드2"]
}`;

export const DEFAULT_RAW_SUBJECT_TEMPLATE = '[회의록 원문] {title} - {date}';

export const DEFAULT_RAW_BODY_TEMPLATE = `## 회의 정보
- **회의명**: {title}
- **참석자**: {attendees}
- **날짜**: {date}

---

## 회의 원문

{transcript}`;

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: '[회의록] {title} - {date}',
  body: `{summary}

---

## 주요 결정사항
{decisions}

## Action Items
{action_items}

## 참석자
{attendees}`,
};
