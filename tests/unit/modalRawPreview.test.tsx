import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// In-memory chrome.storage.local mock + sendMessage spy.
const store: Record<string, unknown> = {};
const sendMessage = vi.fn();
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  sendMessage.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-22T10:00:00Z'));
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage,
      lastError: undefined,
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  };
});

import { Modal } from '../../src/content/modal/Modal';

describe('Modal — raw mode unified preview', () => {
  it('lands in the editable PREVIEW (not a direct send) when 원문 그대로 발송 is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <Modal
        transcript={'이것은 회의 원문입니다.'}
        meetingTitle={'Sprint Review'}
        attendees={['Alice', 'Bob']}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: '원문 그대로 발송' }));

    // The variable-substituted subject from the formatter lands in the preview.
    await waitFor(() =>
      screen.getByText('[회의록 원문] Sprint Review - 2026-03-22'),
    );
    // The transcript body is rendered into the editable preview.
    expect(screen.getByText(/이것은 회의 원문입니다\./)).toBeTruthy();
    // PREVIEW footer (이메일 발송), NOT an immediate SENDING spinner.
    expect(screen.getByRole('button', { name: '이메일 발송' })).toBeTruthy();
    // No email was sent merely by entering the preview.
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
