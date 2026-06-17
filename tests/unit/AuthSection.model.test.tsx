import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const storageStore: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: storageStore[key] })),
      set: vi.fn((obj: Record<string, unknown>) => {
        Object.assign(storageStore, obj);
        return Promise.resolve();
      }),
    },
  },
});
vi.stubGlobal('fetch', vi.fn());

import { AuthSection } from '../../src/popup/components/AuthSection';
import { AVAILABLE_MODELS, OPENAI_MODEL } from '../../src/shared/constants';

describe('AuthSection model dropdown', () => {
  beforeEach(() => {
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
  });

  it('renders an option for every available model', async () => {
    render(<AuthSection />);
    const select = await screen.findByLabelText('요약 모델');
    const options = (select as HTMLSelectElement).querySelectorAll('option');
    expect(options).toHaveLength(AVAILABLE_MODELS.length);
  });

  it('defaults to OPENAI_MODEL when nothing is stored', async () => {
    render(<AuthSection />);
    const select = (await screen.findByLabelText('요약 모델')) as HTMLSelectElement;
    expect(select.value).toBe(OPENAI_MODEL);
  });

  it('persists the chosen model to storage on change', async () => {
    render(<AuthSection />);
    const select = (await screen.findByLabelText('요약 모델')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'gpt-4o' } });
    await waitFor(() => expect(storageStore['model']).toBe('gpt-4o'));
    expect(select.value).toBe('gpt-4o');
  });
});
