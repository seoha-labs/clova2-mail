import type { EmailTemplate } from './types';

export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODEL = 'gpt-4o-mini';
export const GMAIL_SEND_URL = 'https://www.googleapis.com/gmail/v1/users/me/messages/send';
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const MAX_TOKENS_SINGLE = 50_000;
export const MAX_TOKENS_CHUNK = 100_000;
export const CHUNK_SIZE = 30_000;
export const MIN_TRANSCRIPT_LENGTH = 50;

export const SYSTEM_PROMPT = `당신은 회의 원문을 팀 공유용 이메일 초안으로 정리하는 전문가입니다.

## 목표
회의 원문을 너무 과하게 축약하지 말고, 회의의 핵심 맥락과 논의 흐름이 드러나도록 정리하세요.
단순 요약이 아니라, 실제로 팀에 공유 가능한 수준의 이메일 본문 콘텐츠를 생성해야 합니다.

## 작성 원칙
- 너무 짧게 요약하지 말 것. 회의에서 실제로 중요하게 논의된 내용은 충분히 반영할 것.
- 중복되거나 군더더기인 표현은 정리하되, 핵심 쟁점과 결론은 빠뜨리지 말 것.
- 회의 중 확정된 내용과 아직 보류된 내용을 구분해서 쓸 것.
- 기술적 논의가 포함된 경우, 왜 그 논의가 중요했는지도 드러나게 정리할 것.
- 회의 참석자 발언을 그대로 옮기기보다, 업무 문서처럼 자연스럽게 재구성할 것.
- 다만 "누가 어떤 우려를 제기했고 어떤 관점 차이가 있었는지"는 흐름상 중요하면 남길 것.
- 원문에 잡담이나 끼어드는 말이 많아도, 핵심 논의를 중심으로 재구성할 것.
- 한국어로 작성할 것.

## 출력 형식
반드시 아래 JSON 스키마에 맞게 응답하세요.

{
  "summary_bullets": [
    "회의 전체를 3~5개 bullet으로 요약. 회의 목적, 핵심 쟁점, 결론 방향이 드러나게 작성."
  ],
  "decisions": [
    "이번 회의에서 확정되었거나 잠정 합의된 사항을 각각 bullet으로 정리."
  ],
  "action_items": [
    {
      "task": "실행 가능한 수준으로 구체적으로 작성한 후속 작업 내용",
      "assignee": "담당자가 명확하면 이름, 불명확하면 역할 단위 (예: 기획팀)",
      "deadline": "기한이 명시되면 기재, 없으면 '추후 논의' 또는 '차기 논의 전'"
    }
  ],
  "discussions": [
    "회의에서 길게 논의되었지만 확정되지 않은 쟁점, 향후 추가 검토가 필요한 항목, 트레이드오프나 우려사항 등을 충분히 설명. 단순 나열이 아니라 왜 보류되었는지도 드러나게 작성."
  ],
  "inferred_variables": {
    "변수명": "유추한 값"
  }
}

## 템플릿 변수 유추 규칙
- 이메일 템플릿에 {변수명} 형태의 중괄호 변수가 포함될 수 있습니다.
- 아래 예약 변수는 시스템이 자동 치환하므로 inferred_variables에 포함하지 마세요:
  title, date, summary_bullets, decisions, action_items, discussions, attendees
- 그 외의 {변수명}이 템플릿에 있다면, 회의 원문의 맥락에서 해당 변수의 의미를 유추하여 inferred_variables에 key-value로 포함하세요.
- 예시: {currentDate} → "2026-03-28", {meetingTopic} → "2026년 3분기 마케팅 전략 회의", {sender} → "이준서"
- 유추할 근거가 없는 변수는 빈 문자열("")로 넣으세요.

## 주의사항
- 반드시 JSON 형식으로만 응답하세요.
- 발언자별 대화체를 그대로 유지하지 말고, 문서형 정리로 바꾸세요.`;

export const DEFAULT_RAW_SUBJECT_TEMPLATE = '[회의록 원문] {title} - {date}';

export const DEFAULT_RAW_BODY_TEMPLATE = `## 회의 정보
- **회의명**: {title}
- **참석자**: {attendees}
- **날짜**: {date}

---

## 회의 원문

{transcript}`;

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: '[회의록] {title} ({date})',
  body: `안녕하세요.
금일 진행된 {title} 미팅 결과를 정리하여 공유드립니다.

## 회의 간단 요약
{summary_bullets}

## 주요 결정사항
{decisions}

## 실행 과제
{action_items}

## 주요 논의 및 보류 사항
{discussions}

감사합니다.`,
};
