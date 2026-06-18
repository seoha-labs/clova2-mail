import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// In-memory chrome.storage.local mock
const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = {
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

import { RecipientList } from '../../src/popup/components/RecipientList';

function csvFile(content: string, name = 'recipients.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('RecipientList — CSV import', () => {
  it('imports valid rows, shows the summary, and persists', async () => {
    render(<RecipientList />);
    await waitFor(() => screen.getByText(/CSV 가져오기/));

    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const csv = 'name,email\nAlice,alice@test.com\nBob,bob@test.com';
    await userEvent.upload(input, csvFile(csv));

    await waitFor(() => screen.getByText(/2건 추가/));
    expect(screen.getByText(/0건 스킵/)).toBeTruthy();

    await waitFor(() => {
      expect((store['recipients'] as unknown[]).length).toBe(2);
    });
    expect(screen.getByText(/alice@test.com/)).toBeTruthy();
  });

  it('shows skipped reasons and only persists good rows', async () => {
    render(<RecipientList />);
    await waitFor(() => screen.getByTestId('csv-file-input'));

    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const csv = 'name,email\nAlice,alice@test.com\nBad,not-an-email';
    await userEvent.upload(input, csvFile(csv));

    await waitFor(() => screen.getByText(/1건 추가, 1건 스킵/));
    expect(screen.getByText(/not-an-email/)).toBeTruthy();
    await waitFor(() => {
      expect((store['recipients'] as unknown[]).length).toBe(1);
    });
  });

  it('explains required columns and downloads a sample on request', async () => {
    const createObjectURL = vi.fn(() => 'blob:sample');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<RecipientList />);
    await waitFor(() => screen.getByText(/컬럼 순서는 무관합니다/));

    await userEvent.click(screen.getByRole('button', { name: '샘플 CSV 받기' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it('shows a clear message and does not mutate on an empty file', async () => {
    render(<RecipientList />);
    await waitFor(() => screen.getByTestId('csv-file-input'));

    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    await userEvent.upload(input, csvFile('   \n'));

    await waitFor(() => screen.getByText(/가져올 수 있는 수신자가 없습니다/));
    expect(store['recipients']).toBeUndefined();
  });
});
