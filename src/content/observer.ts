type ReadyCallback = () => void;

const TRANSCRIPT_INDICATORS = [
  '[class*="transcript"]',
  '[class*="minute"]',
  '[class*="record"]',
  '[data-testid*="transcript"]',
];

export function watchForTranscript(onReady: ReadyCallback): MutationObserver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isTranscriptPage()) {
        onReady();
      }
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial check
  if (isTranscriptPage()) {
    setTimeout(onReady, 1000);
  }

  return observer;
}

function isTranscriptPage(): boolean {
  return TRANSCRIPT_INDICATORS.some(
    (selector) => document.querySelector(selector) !== null,
  );
}
