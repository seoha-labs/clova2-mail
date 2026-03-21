import { watchForTranscript } from './observer';
import { injectButton, isButtonInjected, removeButton } from './injector';
import { extractTranscript, installFetchInterceptor } from './extractor';
import { showModal } from './modal';

// ClovaNote API 요청에서 note-* 헤더를 캡처하기 위해 fetch 인터셉터 설치
installFetchInterceptor();

const BUTTON_ID = 'clova2mail-btn';

async function handleClova2MailClick(): Promise<void> {
  // 버튼 로딩 상태 표시
  const btn = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '불러오는 중...';
  }

  try {
    const extracted = await extractTranscript();
    // API 응답 이후에 모달을 한 번만 열어야 함
    // (null로 먼저 열면 showModal 내부에서 중복 생성 방지 로직에 걸려 두 번째 호출이 무시됨)
    showModal(
      extracted?.transcript ?? null,
      extracted?.title ?? '회의록',
      extracted?.attendees ?? [],
    );
  } catch (err) {
    console.error('[clova2Mail] 원문 추출 실패:', err);
    showModal(null, '회의록', []);
  } finally {
    // 버튼 원복
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'clova2Mail';
    }
  }
}

let transcriptObserver: MutationObserver | null = null;

function onTranscriptReady(): void {
  if (!isButtonInjected()) {
    injectButton(handleClova2MailClick);
  }
}

// URL 변경 감지 (SPA navigation)
let lastUrl = location.href;
let urlDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeButton();

    // 이전 transcript observer 정리 후 새로 시작
    transcriptObserver?.disconnect();

    if (urlDebounceTimer) clearTimeout(urlDebounceTimer);
    urlDebounceTimer = setTimeout(() => {
      transcriptObserver = watchForTranscript(onTranscriptReady);
    }, 1000);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// MutationObserver로 transcript 페이지 감지
transcriptObserver = watchForTranscript(onTranscriptReady);
