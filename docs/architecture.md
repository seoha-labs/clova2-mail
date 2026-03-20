# clova2Mail - Chrome Extension Architecture

> v1.2 - Codex 2차 리뷰 반영 (Gmail email 표시, chunk 순차처리, 템플릿 raw HTML 금지)

## Overview

ClovaNote 웹 페이지(clovanote.naver.com)에서 회의 transcript를 추출하고,
OpenAI API로 사용자 정의 이메일 템플릿에 맞게 요약한 뒤, Gmail로 지정된 수신자에게 이메일을 발송하는 Chrome Extension.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                    (Manifest V3)                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Content Script│  │   Popup UI   │  │  Background   │  │
│  │              │  │   (Settings) │  │  Service Worker│  │
│  │ - DOM 감시    │  │              │  │               │  │
│  │ - 버튼 주입   │  │ - API key 설정│  │ - API 호출     │  │
│  │ - 텍스트 추출 │  │ - 수신자 관리 │  │ - 이메일 발송  │  │
│  │ - 모달 렌더링 │  │ - 템플릿 편집 │  │ - Gmail OAuth  │  │
│  │ - Sanitize   │  │ - Gmail 연결 │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
│         └────────── chrome.runtime ───────────┘          │
│                     message passing                      │
└─────────────────────┬───────────────┬────────────────────┘
                      │               │
              ┌───────▼──────┐ ┌──────▼───────┐
              │  OpenAI API  │ │  Gmail API   │
              │  (GPT-4o)    │ │  (v1/send)   │
              │  요약 생성    │ │  이메일 발송  │
              └──────────────┘ └──────────────┘
```

## Component Details

### 1. Content Script (`content.ts`)

**역할**: ClovaNote 페이지에 주입되어 DOM 조작

```
Target URL: https://clovanote.naver.com/*
```

**기능**:
- **DOM 감시 (MutationObserver)**: SPA이므로 페이지 변경 감지
- **버튼 주입**: "Download transcript" 버튼 근처에 "clova2Mail" 버튼 추가
- **텍스트 추출**: transcript 영역의 텍스트를 DOM에서 파싱
  - 추출 실패 시 null 반환 → 수동 입력 모달 표시
  - document.body fallback 사용하지 않음 (쓰레기 데이터 방지)
- **HTML Sanitization**: DOMPurify로 AI 출력 sanitize 후 렌더링
- **모달 렌더링**: Shadow DOM 기반 모달 (스타일 격리)

### 2. Popup UI (`popup.html/ts`)

**역할**: 확장 프로그램 설정 관리

**화면 구성**:
```
┌─────────────────────────────┐
│  clova2Mail Settings        │
├─────────────────────────────┤
│                             │
│  [🔑 OpenAI API Key]        │
│  sk-***                     │
│  Status: Valid ✓            │
│                             │
├─────────────────────────────┤
│  📧 Gmail                   │
│  [Connect Gmail]            │
│  Status: Connected ✓        │
│                             │
├─────────────────────────────┤
│  👥 Recipients              │
│  ┌─────────────────────┐    │
│  │ kim@company.com   ✕ │    │
│  │ lee@company.com   ✕ │    │
│  │ park@company.com  ✕ │    │
│  └─────────────────────┘    │
│  [+ Add Recipient]          │
│                             │
├─────────────────────────────┤
│  📝 Email Template          │
│  ┌─────────────────────┐    │
│  │ Subject:            │    │
│  │ [회의록] {title}     │    │
│  │                     │    │
│  │ Body Format:        │    │
│  │ ## 회의 요약         │    │
│  │ {summary}           │    │
│  │                     │    │
│  │ ## 주요 결정사항      │    │
│  │ {decisions}         │    │
│  │                     │    │
│  │ ## Action Items     │    │
│  │ {action_items}      │    │
│  │                     │    │
│  │ ## 참석자            │    │
│  │ {attendees}         │    │
│  └─────────────────────┘    │
│                             │
│  [Save Settings]            │
└─────────────────────────────┘
```

### 3. Background Service Worker (`background.ts`)

**역할**: API 통신, 인증 관리, 이메일 발송

**기능**:
- **API Key 관리**: OpenAI API key를 chrome.storage에서 읽기
- **요약 생성**: OpenAI GPT-4o API 호출 → 템플릿 기반 요약
  - 토큰 사전 카운트 → 50K 초과 시 chunk-summarize-merge
  - 100K 초과 시 거부
- **Gmail OAuth**: `chrome.identity.getAuthToken()` 단일 방식
  - refreshToken/expiresAt 직접 저장하지 않음 (Chrome이 관리)
  - `userinfo.email` 스코프로 연결된 계정 이메일 주소 조회 (Popup 표시용)
- **이메일 발송**: Gmail API로 발송 (UTF-8 안전 MIME 인코딩)
- **메시지 라우팅**: Content Script ↔ Popup 간 통신 중계

## Data Flow

```
[사용자가 ClovaNote에서 회의 녹음 완료]
         │
         ▼
[Content Script: transcript 페이지 감지]
         │
         ▼
[Content Script: "clova2Mail" 버튼 주입]
         │
         ▼
[사용자: clova2Mail 버튼 클릭]
         │
         ▼
[Content Script: DOM에서 transcript 텍스트 추출]
         │
    ┌────┴────┐
    │         │
  성공      실패 (null)
    │         │
    │    [수동 입력 모달 표시]
    │         │
    └────┬────┘
         │
         ▼
[Content Script → Background: 텍스트 + 템플릿 전달]
         │
         ▼
[Background: 토큰 카운트]
         │
    ┌────┼────────┐
    │    │        │
  <50K  50K~100K  >100K
    │    │        │
    │  chunk처리  [거부 메시지]
    │    │
    └────┘
         │
         ▼
[Background: OpenAI API 호출]
         │
         ▼
[Background → Content Script: 요약 결과 반환]
         │
         ▼
[Content Script: Markdown → HTML → DOMPurify sanitize]
         │
         ▼
[Content Script: 모달에 요약 미리보기 표시]
         │
         ▼
[사용자: 내용 확인 후 "발송" 클릭]
         │
         ▼
[Content Script → Background: 발송 요청]
         │
         ▼
[Background: chrome.identity.getAuthToken() → Gmail API 발송]
         │
         ▼
[완료 알림]
```

## Tech Stack (MVP)

| Layer | Technology | Reason |
|-------|-----------|--------|
| Extension Framework | Chrome Manifest V3 | 최신 표준, 필수 |
| Language | TypeScript 5.7+ | 타입 안전성 |
| Build Tool | Vite 6 + CRXJS | HMR 지원, 빠른 빌드 |
| UI Framework | React 19 | Popup & Modal UI |
| Styling | Tailwind CSS 4 | 빠른 UI 개발 |
| Markdown → HTML | marked 15 | 경량, 커스텀 가능 |
| HTML Sanitizer | DOMPurify 3 | XSS 방지 업계 표준 |
| State | chrome.storage.local | 설정 영구 저장 |
| AI | OpenAI GPT-4o API (fetch) | 요약 생성 |
| Token Counter | gpt-tokenizer | 사전 토큰 카운트 |
| Email | Gmail API v1 | OAuth, 무료, 신뢰도 |

## Authentication Flow (확정)

### OpenAI API Key
```
Popup → 사용자가 API Key 직접 입력 → chrome.storage.local에 저장
```

### Gmail OAuth (단일 방식: chrome.identity.getAuthToken)
```
Popup → chrome.identity.getAuthToken({ interactive: true })
     → Chrome 내장 Google OAuth 동의 화면
     → Access Token 반환 (Chrome이 캐싱 + 자동 갱신)
     → GET /oauth2/v2/userinfo로 이메일 주소 조회 (v1.2)
     → Popup에 "user@gmail.com 연결됨 ✓" 표시
     → 이메일 발송 시 getAuthToken()으로 매번 유효 토큰 획득
```

> **결정**: launchWebAuthFlow() 사용하지 않음.
> refreshToken, expiresAt 직접 저장하지 않음.
> chrome.storage에 Gmail 토큰 관련 데이터 없음.
> v1.2: `userinfo.email` 스코프 추가로 연결된 계정 이메일 표시.

## Manifest V3 Configuration (MVP)

```json
{
  "manifest_version": 3,
  "name": "clova2Mail",
  "version": "1.0.0",
  "description": "ClovaNote 회의록을 AI로 요약하여 이메일 발송",
  "permissions": [
    "storage",
    "identity",
    "activeTab"
  ],
  "host_permissions": [
    "https://clovanote.naver.com/*",
    "https://api.openai.com/*",
    "https://www.googleapis.com/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://clovanote.naver.com/*"],
      "js": ["src/content/index.ts"],
      "css": ["src/styles/content.css"]
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  },
  "oauth2": {
    "client_id": "<GOOGLE_CLIENT_ID>",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  }
}
```

> **v1.1 변경**: `https://api.resend.com/*` 제거 (MVP scope 외)
> **v1.2 변경**: `userinfo.email` 스코프 추가 (연결된 Gmail 계정 이메일 표시용)

## Security Considerations

1. **API Key 저장**: chrome.storage.local (Extension 프로세스만 접근)
2. **HTML Sanitization**: DOMPurify 화이트리스트 (script, iframe, a, img, style 속성 등 제거)
3. **템플릿 보호**: 사용자 템플릿에서 raw HTML 태그 strip, Markdown만 허용 (v1.2)
4. **Content Security Policy**: Manifest V3 기본 CSP 준수
5. **XSS 방지**: Shadow DOM (closed) + DOMPurify + textContent 기반 변수 치환
5. **OAuth Token**: chrome.identity API 전담 관리 (직접 저장 안 함)
6. **개인정보**: transcript/요약 데이터 영구 저장 안 함, 자체 서버 없음

## Implementation Phases

### Phase 1: Core MVP
- [x] OAuth 방식 확정 (chrome.identity.getAuthToken 단일)
- [x] HTML sanitization 설계 (DOMPurify + 화이트리스트)
- [x] 긴 회의록 처리 전략 (chunk-summarize-merge)
- [x] MIME 인코딩 수정 (UTF-8 Base64)
- [ ] 프로젝트 셋업 (Vite + CRXJS + React + TS)
- [ ] Content Script: ClovaNote DOM 감지 + 버튼 주입
- [ ] Content Script: Transcript 텍스트 추출 (실패 시 수동 입력)
- [ ] Popup: OpenAI API key 입력 + Gmail 연결
- [ ] Background: OpenAI API 요약 호출 (토큰 카운트 + 청킹)
- [ ] Content Script: 모달 미리보기 (sanitized HTML)
- [ ] Popup: 수신자 목록 관리
- [ ] Popup: 이메일 템플릿 편집
- [ ] Background: Gmail API 이메일 발송 (UTF-8 MIME)
- [ ] 발송 완료 알림

### Phase 2: Enhancement
- [ ] Resend 이메일 옵션 추가 (이메일 서비스 추상화)
- [ ] 발송 히스토리 저장
- [ ] 다국어 지원 (한/영/일)
- [ ] 요약 결과 수동 편집
- [ ] 수신자 그룹 관리

### Phase 3: Advanced
- [ ] Claude API 연동 옵션
- [ ] 요약 품질 피드백 루프
- [ ] 정기 회의 자동 감지
- [ ] Slack/Teams 연동
