import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS, OPENAI_MODEL } from '../../src/shared/constants';
import type { StorageSchema } from '../../src/shared/types';

describe('StorageSchema.model type', () => {
  it('accepts an object with a string model field', () => {
    const partial: Pick<StorageSchema, 'model'> = { model: 'gpt-4o' };
    expect(partial.model).toBe('gpt-4o');
  });
});

describe('AVAILABLE_MODELS', () => {
  it('is a non-empty list of {id,label} entries', () => {
    expect(Array.isArray(AVAILABLE_MODELS)).toBe(true);
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    for (const m of AVAILABLE_MODELS) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it('contains the three curated models', () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(ids).toEqual(['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']);
  });

  it('includes OPENAI_MODEL (the default) as one of its ids', () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(ids).toContain(OPENAI_MODEL);
  });
});
