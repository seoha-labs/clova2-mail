# clova2Mail v1.6.0 - 다국어 지원 (i18n) 구현 플랜

## 접근 방식: Chrome Extension 네이티브 i18n + React 헬퍼

Chrome Extension의 빌트인 `chrome.i18n` API와 `_locales` 폴더를 사용한다.
React 컴포넌트에서는 간단한 `t()` 헬퍼 함수로 감싸서 사용한다.

### 왜 chrome.i18n인가?
- Chrome Extension 표준 방식 (manifest의 name/description도 자동 번역)
- 추가 라이브러리 불필요 (번들 사이즈 증가 없음)
- 브라우저 언어 설정을 자동 감지
- Chrome Web Store에서 다국어 지원으로 인정

### 지원 언어
- **ko** (한국어) - 기본 언어 (`default_locale`)
- **en** (영어) - 추가 언어

---

## 구현 단계

### Step 1: 로케일 파일 구조 생성

```
public/_locales/
├── ko/
│   └── messages.json    # 한국어 (기본)
└── en/
    └── messages.json    # 영어
```

`manifest.json`에 `"default_locale": "ko"` 추가

### Step 2: `t()` 헬퍼 함수 작성

**파일**: `src/shared/i18n.ts`

```ts
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}
```

- Content Script, Popup, Background 어디서든 동일하게 사용
- 키가 없으면 키 자체를 반환 (디버깅 용이)

### Step 3: 메시지 키 정의 & 번역 파일 작성

12개 파일에서 100+ 문자열 추출, 네이밍 컨벤션:

| 접두사 | 영역 | 예시 |
|--------|------|------|
| `popup_` | Popup UI | `popup_loading`, `popup_connectGmail` |
| `auth_` | 인증 섹션 | `auth_apiKeyLabel`, `auth_validate` |
| `recipient_` | 수신자 관리 | `recipient_add`, `recipient_invalidEmail` |
| `group_` | 그룹 관리 | `group_create`, `group_editComplete` |
| `template_` | 템플릿 편집 | `template_title`, `template_resetDefaults` |
| `modal_` | Content Script 모달 | `modal_sending`, `modal_success` |
| `injector_` | 버튼 주입 | `injector_buttonText`, `injector_buttonTitle` |
| `error_` | 에러 메시지 | `error_noRecipients`, `error_invalidEmail` |
| `common_` | 공통 | `common_cancel`, `common_close`, `common_confirm` |

### Step 4: 파일별 문자열 교체

변경 대상 파일 (총 12개):

**Popup (5개)**
1. `src/popup/App.tsx` - 8개 문자열
2. `src/popup/components/AuthSection.tsx` - 10개 문자열
3. `src/popup/components/RecipientList.tsx` - 12개 문자열
4. `src/popup/components/GroupForm.tsx` - 10개 문자열
5. `src/popup/components/GroupCard.tsx` - 3개 문자열
6. `src/popup/components/TemplateEditor.tsx` - 12개 문자열

**Content Script (3개)**
7. `src/content/modal/Modal.tsx` - 30개+ 문자열 (가장 많음)
8. `src/content/modal/RecipientSelector.tsx` - 5개 문자열
9. `src/content/injector.ts` - 2개 문자열
10. `src/content/index.ts` - 3개 문자열

**Background (1개)**
11. `src/background/index.ts` - 3개 문자열 (사용자에게 보이는 에러만)

**Shared (1개)**
12. `src/shared/constants.ts` - 시스템 프롬프트 & 기본 템플릿 (이것은 번역 대상이 아님 - AI 프롬프트는 항상 한국어)

### Step 5: manifest.json 국제화

```json
{
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "default_locale": "ko"
}
```

### Step 6: HTML lang 속성 동적 설정

`src/popup/index.html`의 `lang="ko"`를 동적으로 설정하거나,
`chrome.i18n.getUILanguage()`에 따라 React에서 `document.documentElement.lang` 업데이트.

### Step 7: 테스트

- 기존 테스트가 `chrome.i18n.getMessage` 모킹 필요
- `vitest.config.ts`에 chrome.i18n mock 추가
- 브라우저 언어를 영어로 변경하여 수동 검증

---

## 변경하지 않는 것

- **AI 시스템 프롬프트** (`constants.ts`의 SYSTEM_PROMPT): 항상 한국어로 요약 생성 (요약 언어는 별도 기능)
- **기본 이메일 템플릿**: 사용자가 직접 편집하는 영역이므로 i18n 대상 아님
- **로그 메시지**: `console.log/error`의 내부 디버그 메시지는 영어 유지
- **변수명/코드**: `{title}`, `{date}` 등 템플릿 변수는 그대로

---

## 파일 생성/수정 요약

| 작업 | 파일 |
|------|------|
| **생성** | `public/_locales/ko/messages.json` |
| **생성** | `public/_locales/en/messages.json` |
| **생성** | `src/shared/i18n.ts` |
| **수정** | `manifest.json` (default_locale 추가, name/description MSG화) |
| **수정** | `src/popup/index.html` (lang 동적화) |
| **수정** | Popup 컴포넌트 6개 (하드코딩 → `t()` 호출) |
| **수정** | Content Script 4개 (하드코딩 → `t()` 호출) |
| **수정** | Background 1개 (에러 메시지 → `t()` 호출) |
| **수정** | 테스트 파일들 (chrome.i18n mock 추가) |

총 **신규 3개 파일**, **수정 ~14개 파일**
