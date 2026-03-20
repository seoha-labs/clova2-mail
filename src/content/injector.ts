const BUTTON_ID = 'clova2mail-btn';

const TOOLBAR_SELECTORS = [
  '[data-testid*="download"]',
  '[class*="toolbar"]',
  '[class*="action-bar"]',
  '[class*="tool-bar"]',
  '[class*="button-group"]',
];

export function findToolbar(): HTMLElement | null {
  // Strategy 1: Known selectors
  for (const selector of TOOLBAR_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      return (el.parentElement ?? el) as HTMLElement;
    }
  }

  // Strategy 2: Find by button text
  const buttons = Array.from(document.querySelectorAll('button'));
  const downloadBtn = buttons.find(
    (btn) =>
      btn.textContent?.includes('다운로드') ||
      btn.textContent?.includes('Download') ||
      btn.textContent?.includes('download'),
  );
  if (downloadBtn?.parentElement) {
    return downloadBtn.parentElement as HTMLElement;
  }

  return null;
}

export function createButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.textContent = 'clova2Mail';
  button.title = 'AI 요약 후 이메일 발송';
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    marginLeft: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#0d9488',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  });

  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#0f766e';
  });
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#0d9488';
  });

  button.addEventListener('click', onClick);
  return button;
}

export function isButtonInjected(): boolean {
  return document.getElementById(BUTTON_ID) !== null;
}

export function removeButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
}

export function injectButton(onClick: () => void): boolean {
  if (isButtonInjected()) return true;

  const toolbar = findToolbar();
  if (!toolbar) return false;

  const button = createButton(onClick);
  toolbar.appendChild(button);
  return true;
}
