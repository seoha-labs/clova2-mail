import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { Modal } from './Modal';
import modalCss from './modal.css?inline';

const MODAL_HOST_ID = 'clova2mail-modal-host';

let currentRoot: Root | null = null;

export function showModal(
  transcript: string | null,
  meetingTitle: string,
  attendees: readonly string[],
): void {
  if (document.getElementById(MODAL_HOST_ID)) return;

  const host = document.createElement('div');
  host.id = MODAL_HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = modalCss;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  document.body.appendChild(host);

  const root = createRoot(mountPoint);
  currentRoot = root;

  const handleClose = () => {
    root.unmount();
    currentRoot = null;
    host.remove();
  };

  root.render(
    createElement(Modal, {
      transcript,
      meetingTitle,
      attendees: [...attendees],
      onClose: handleClose,
    }),
  );
}

export function hideModal(): void {
  if (currentRoot) {
    currentRoot.unmount();
    currentRoot = null;
  }
  document.getElementById(MODAL_HOST_ID)?.remove();
}
