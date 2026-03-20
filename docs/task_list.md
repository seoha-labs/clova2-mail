# clova2Mail - Implementation Task List

> v1.2 - Codex 2차 리뷰 반영

## Phase 1: Core MVP

### Sprint 1: Project Setup & Content Script (Week 1)
1. **프로젝트 초기화**
   - pnpm init, Vite 6 + CRXJS 2 + React 19 + TypeScript 5.7 셋업
   - Tailwind CSS 4 설정
   - Manifest V3 설정 (Gmail 단일, Resend 없음, oauth2 scopes: gmail.send + userinfo.email)
   - ESLint 9 flat config + Prettier 설정

2. **Content Script: DOM 감지 & 버튼 주입**
   - ClovaNote 실제 DOM 구조 분석 (DevTools)
   - MutationObserver로 transcript 페이지 감지
   - "clova2Mail" 버튼 생성 및 주입
   - 버튼 스타일링 (ClovaNote UI와 어울리게)

3. **Content Script: Transcript 추출**
   - DOM 셀렉터 매핑 (transcript 텍스트, 제목, 참석자)
   - 추출 실패 시 null 반환 (document.body fallback 없음)
   - 최소 길이 검증 (50자 이상)

### Sprint 2: Popup Settings & OpenAI Integration (Week 2)
4. **Popup UI: 인증 섹션**
   - OpenAI API key 입력 필드
   - API key 유효성 검증 (test call)
   - chrome.storage.local에 저장
   - Gmail 연결 버튼 (chrome.identity.getAuthToken)
   - userinfo API로 연결된 이메일 주소 조회 + 표시
   - 연결 상태 표시 ("user@gmail.com 연결됨 ✓")

5. **Popup UI: 수신자 관리**
   - 이메일 주소 추가/삭제
   - 이메일 형식 검증
   - 수신자 목록 chrome.storage 저장/로드

6. **Popup UI: 이메일 템플릿 편집**
   - 제목 템플릿 (변수: {title}, {date})
   - 본문 템플릿 편집기 (Markdown only)
   - 저장 시 raw HTML 태그 자동 strip
   - 안내 텍스트: "Markdown 문법을 사용하세요. HTML 태그는 자동 제거됩니다."
   - 기본 템플릿 제공
   - 저장/불러오기

7. **Background: OpenAI API 통합**
   - API 클라이언트 구현 (fetch 기반)
   - 시스템 프롬프트 + 사용자 템플릿 조합
   - 토큰 사전 카운트 (gpt-tokenizer)
   - 50K~100K 토큰: chunk-summarize-merge (순차 처리, for...of)
   - 각 chunk 완료 시 진행률 콜백 (onProgress)
   - 100K 초과: 거부 + 에러 메시지
   - 응답 JSON 파싱 + 에러 핸들링

8. **Background: 메시지 핸들러**
   - Content Script ↔ Background 메시지 라우팅
   - 타입세이프 메시지 정의
   - CONNECT_GMAIL / GMAIL_STATUS 메시지 추가

### Sprint 3: Modal & Email Sending (Week 3)
9. **Content Script: HTML Sanitizer**
   - DOMPurify 래퍼 (sanitizer.ts)
   - 허용 태그 화이트리스트, ALLOWED_ATTR: [] (style 포함 전부 금지)
   - marked로 Markdown → HTML 변환
   - 파이프라인: 템플릿 HTML strip → 변수치환 → Markdown → HTML → Sanitize → 인라인 CSS 주입

10. **Content Script: 미리보기 모달**
    - Shadow DOM (closed) 기반 React mount
    - 모달 상태 머신 (IDLE → EXTRACTING → LOADING → PREVIEW → SENDING → SENT)
    - 추출 실패 시 수동 입력 모달 (EXTRACT_FAILED → MANUAL_INPUT)
    - sanitized HTML 렌더링 (인라인 CSS는 코드에서 주입)
    - 수신자 바 + 발송/취소 버튼
    - 긴 회의록 순차 처리 진행률 표시 ("1/3 → 2/3 → 3/3")

11. **Background: Gmail 발송**
    - chrome.identity.getAuthToken() 기반 토큰 획득
    - UTF-8 안전 Base64 인코딩 (TextEncoder + btoa)
    - multipart/alternative MIME 메시지 (plain + html)
    - RFC 2047 B-encoding Subject (한국어 안전)
    - Gmail API messages.send 호출
    - 에러 핸들링 + 결과 전달

### Sprint 4: Testing & Polish (Week 4)
12. **유닛 테스트**
    - openai.test.ts: 프롬프트 빌드, JSON 파싱, 토큰 카운트, 순차 청킹
    - extractor.test.ts: DOM 추출 로직, null 반환 케이스
    - gmail.test.ts: MIME 생성, UTF-8 인코딩, 한국어 제목/본문, userinfo 조회
    - sanitizer.test.ts: XSS 태그 제거, style 속성 제거, 정상 Markdown 태그 보존
    - storage.test.ts: 스토리지 래퍼
    - template.test.ts: raw HTML strip, Markdown 보존

13. **E2E 테스트**
    - Playwright로 Extension 통합 테스트

14. **UX 마무리**
    - 에러 상태 UI (API 키 없음, 추출 실패, 토큰 초과, Gmail 미연결)
    - 발송 완료 토스트 알림
    - 아이콘 디자인 (16/48/128px)

## Phase 2: Enhancement (후순위)
- Resend 이메일 옵션 (이메일 서비스 추상화 레이어)
- 발송 히스토리
- 요약 수동 편집
- 수신자 그룹
- 다국어 지원
