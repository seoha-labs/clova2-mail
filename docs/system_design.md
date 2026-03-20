# clova2Mail - System Design

> v1.2 - Codex 2차 리뷰 반영 (Gmail email 표시, chunk 순차처리, 템플릿 raw HTML 금지)

## Message Protocol

Content Script, Popup, Background 간 통신은 `chrome.runtime.sendMessage`로 처리.

### Message Types

```typescript
// Content Script → Background
type ExtractAndSummarizeRequest = {
  type: 'EXTRACT_AND_SUMMARIZE';
  payload: {
    transcript: string;       // 추출된 원문
    meetingTitle: string;     // 회의 제목
    attendees?: string[];     // 참석자
  };
};

// Background → Content Script
type SummarizeResponse = {
  type: 'SUMMARIZE_RESULT';
  payload:
    | {
        success: true;
        subject: string;          // 이메일 제목
        htmlBody: string;         // sanitize 전 HTML (Content Script에서 sanitize)
        plainBody: string;        // 텍스트 형식 본문
      }
    | {
        success: false;
        error: 'TOKEN_LIMIT_EXCEEDED' | 'API_ERROR' | 'PARSE_ERROR';
        message: string;
        tokenCount?: number;      // TOKEN_LIMIT_EXCEEDED 시 포함
      };
};

// Content Script → Background
type SendEmailRequest = {
  type: 'SEND_EMAIL';
  payload: {
    to: string[];             // 수신자 목록
    subject: string;
    htmlBody: string;         // sanitized HTML
  };
};

// Background → Content Script
type SendEmailResponse = {
  type: 'EMAIL_SENT';
  payload: {
    success: boolean;
    messageId?: string;
    error?: string;
  };
};

// Popup → Background
type GetGmailStatusRequest = {
  type: 'GET_GMAIL_STATUS';
};

type GetGmailStatusResponse = {
  type: 'GMAIL_STATUS';
  payload: {
    connected: boolean;
    email?: string;       // userinfo.email 스코프로 조회
  };
};

// Popup → Background
type ConnectGmailRequest = {
  type: 'CONNECT_GMAIL';
};

type ConnectGmailResponse = {
  type: 'GMAIL_CONNECTED';
  payload: {
    success: boolean;
    email?: string;
    error?: string;
  };
};
```

## Storage Schema (MVP)

```typescript
// chrome.storage.local
interface StorageSchema {
  // Auth - OpenAI만 저장. Gmail 토큰은 chrome.identity가 관리.
  openaiApiKey: string;

  // Recipients - flat list (그룹 없음, Phase 2에서 추가)
  recipients: Array<{
    id: string;
    email: string;
    name: string;
  }>;

  // Template - 단일 템플릿
  emailTemplate: {
    subject: string;              // e.g. "[회의록] {title} - {date}"
    body: string;                 // Markdown with placeholders
  };
}
```

> **v1.1 변경**:
> - `gmailToken` 제거 → `chrome.identity.getAuthToken()`이 전담 관리
> - `emailService` 제거 → MVP는 Gmail 단일
> - `resendApiKey` 제거 → Phase 2로 이동
> - `sendHistory` 제거 → Phase 2로 이동
> - `recipients[].group` 제거 → Phase 2로 이동

## Gmail OAuth (확정: chrome.identity.getAuthToken 단일)

```typescript
// Background Service Worker

/**
 * Gmail Access Token 획득.
 * Chrome이 토큰 캐싱, 만료 시 자동 갱신을 처리함.
 * refreshToken, expiresAt 등을 직접 관리할 필요 없음.
 */
async function getGmailToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * 연결된 Gmail 계정 이메일 주소 조회.
 * userinfo.email 스코프 필요.
 */
async function fetchGmailEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Gmail 연결 상태 확인 (Popup에서 사용)
 */
async function checkGmailStatus(): Promise<{ connected: boolean; email?: string }> {
  try {
    const token = await getGmailToken(false);  // interactive: false
    const email = await fetchGmailEmail(token);
    return { connected: true, email: email ?? undefined };
  } catch {
    return { connected: false };
  }
}

/**
 * Gmail 연결 (사용자 동의 화면)
 */
async function connectGmail(): Promise<{ token: string; email?: string }> {
  const token = await getGmailToken(true);  // interactive: true → 동의 화면
  const email = await fetchGmailEmail(token);
  return { token, email: email ?? undefined };
}

/**
 * Gmail 연결 해제
 */
async function disconnectGmail(): Promise<void> {
  const token = await getGmailToken(false);
  chrome.identity.removeCachedAuthToken({ token });
}
```

## ClovaNote DOM Extraction Strategy

ClovaNote는 SPA(React 기반)이므로 직접 DOM을 분석해야 합니다.

### 접근 방법

```typescript
// 1. MutationObserver로 transcript 페이지 로드 감지
const observer = new MutationObserver((mutations) => {
  const transcriptArea = document.querySelector('[class*="transcript"]')
    || document.querySelector('[data-testid*="transcript"]');

  if (transcriptArea && !document.getElementById('clova2mail-btn')) {
    injectButton();
  }
});

// 2. 텍스트 추출 (명시적 실패 처리)
function extractTranscript(): ExtractedData | null {
  const selectors = [
    '[class*="transcript"] [class*="text"]',
    '[class*="minute"] [class*="content"]',
    '[class*="record"] [class*="sentence"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      const text = Array.from(elements)
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join('\n');

      if (text.length > 50) {
        return {
          title: extractTitle(),
          transcript: text,
          attendees: extractAttendees(),
        };
      }
    }
  }

  // 모든 셀렉터 실패 → null 반환 (body fallback 없음)
  return null;
}
```

> **v1.1 변경**: `document.body.innerText` fallback 제거.
> 실패 시 null 반환 → Content Script가 수동 입력 모달 표시.

### 버튼 주입 위치

```
ClovaNote 페이지 내 기능 버튼 영역:
┌──────────────────────────────────────┐
│  [▶ Play] [📋 Copy] [⬇ Download]    │
│                     [📧 clova2Mail]  │  ← 여기에 주입
└──────────────────────────────────────┘
```

## HTML Sanitization Pipeline

> **v1.1 추가**

```typescript
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'code', 'pre',
    'span', 'div',
  ],
  ALLOWED_ATTR: [],              // v1.2: style 포함 모든 속성 금지
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'a', 'img'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'href', 'src', 'action', 'style'],
};

/**
 * 템플릿 저장 시 raw HTML 태그 strip (v1.2 추가)
 * Markdown 문법만 허용.
 */
function stripHtmlFromTemplate(template: string): string {
  return template.replace(/<[^>]*>/g, '');
}

/**
 * AI 요약 결과를 안전한 HTML로 변환
 * 1. 템플릿에서 raw HTML은 이미 strip된 상태
 * 2. JSON → 템플릿 변수 치환 (순수 문자열, HTML 해석 안 함)
 * 3. Markdown → HTML 변환
 * 4. DOMPurify로 위험 태그/속성 제거
 * 5. 이메일용 인라인 CSS는 이 이후에 코드에서 주입
 */
function renderSafeHtml(markdown: string): string {
  const rawHtml = marked(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}
```

## Modal Design (Shadow DOM)

```typescript
function createModal(content: string): HTMLElement {
  const host = document.createElement('div');
  host.id = 'clova2mail-modal-host';
  const shadow = host.attachShadow({ mode: 'closed' });

  // sanitized HTML만 삽입
  const safeHtml = renderSafeHtml(content);

  shadow.innerHTML = `
    <style>
      /* 모달 전용 스타일 - ClovaNote CSS와 충돌 없음 */
    </style>
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>clova2Mail - 이메일 미리보기</h2>
          <button class="close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="recipients-bar"></div>
          <div class="email-preview">${safeHtml}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary">취소</button>
          <button class="btn-primary">📧 발송</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);
  return host;
}
```

## Gmail API Integration (UTF-8 안전 MIME)

> **v1.1 변경**: btoa() → TextEncoder + btoa() 조합, multipart/alternative 올바른 구현

```typescript
/**
 * UTF-8 문자열을 Base64로 인코딩 (한국어 안전)
 * btoa()는 Latin-1만 지원하므로 TextEncoder를 거침
 */
function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

/**
 * Gmail API용 URL-safe Base64
 */
function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * MIME 메시지 생성 (multipart/alternative: plain + html)
 */
function createMimeMessage(
  to: string[],
  subject: string,
  htmlBody: string
): string {
  const boundary = `boundary_${crypto.randomUUID()}`;
  const plainBody = htmlToPlainText(htmlBody);
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;

  return [
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(plainBody),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(htmlBody),
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

/**
 * Gmail API로 이메일 발송
 */
async function sendViaGmail(
  to: string[],
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const token = await getGmailToken(false);
    const message = createMimeMessage(to, subject, htmlBody);
    const encoded = utf8ToBase64Url(message);

    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

## Long Transcript Handling

> **v1.1 추가**

```typescript
import { encode } from 'gpt-tokenizer';

function countTokens(text: string): number {
  return encode(text).length;
}

async function summarizeTranscript(
  transcript: string,
  template: string
): Promise<SummaryResult> {
  const tokenCount = countTokens(transcript);

  // Case 1: 단일 호출 (< 50K tokens, ~3시간 회의)
  if (tokenCount < 50_000) {
    return await callOpenAI(transcript, template);
  }

  // Case 2: Chunk-Summarize-Merge (50K ~ 100K tokens)
  // v1.2: 순차 처리 (Promise.all → for...of). 병렬은 낮은 티어에서 429 위험.
  if (tokenCount < 100_000) {
    const chunks = splitByParagraphs(transcript, 30_000);
    const partialSummaries: PartialSummary[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const result = await callOpenAI(chunk, template);
      partialSummaries.push(result);
      onProgress?.({ current: i + 1, total: chunks.length });
    }
    return await mergeSummaries(partialSummaries, template);
  }

  // Case 3: 거부 (> 100K tokens)
  throw new TranscriptTooLongError(tokenCount);
}

/**
 * 화자 발화 블록 단위로 분할 (문장 중간에서 자르지 않음)
 */
function splitByParagraphs(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const combined = current ? `${current}\n\n${para}` : para;
    if (countTokens(combined) > maxTokens && current) {
      chunks.push(current);
      current = para;
    } else {
      current = combined;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

## Error Handling

| 시나리오 | 처리 |
|---------|------|
| OpenAI API 키 미설정 | 모달에서 Popup 설정 페이지로 유도 |
| OpenAI API 호출 실패 (429, 500) | 에러 메시지 + 재시도 버튼 |
| OpenAI 응답 JSON 파싱 실패 | "요약 형식 오류" + 재시도 |
| Transcript 추출 실패 | null 반환 → 수동 입력 모달 (body fallback 없음) |
| Transcript 100K 토큰 초과 | 거부 메시지 + 수동 입력 유도 |
| Gmail 미연결 | "Gmail을 연결하세요" 안내 |
| Gmail 토큰 만료 | getAuthToken() 자동 갱신, 실패 시 재연결 유도 |
| 이메일 발송 실패 | 에러 상세 표시 + 재시도 |

## Rate Limits

| Service | Limit | 대응 |
|---------|-------|------|
| OpenAI GPT-4o | RPM/TPM varies by tier | 요약은 1회/클릭이므로 무관 |
| Gmail API | 100 emails/day (consumer) | 충분 |
