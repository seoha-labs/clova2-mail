import { describe, it, expect } from 'vitest';
import { EMAIL_REGEX, isValidEmail } from '../../src/shared/email';

describe('EMAIL_REGEX / isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(EMAIL_REGEX.test('alice@example.com')).toBe(true);
    expect(isValidEmail('alice@example.com')).toBe(true);
  });

  it('rejects addresses without a domain dot', () => {
    expect(isValidEmail('alice@example')).toBe(false);
  });

  it('rejects addresses with whitespace', () => {
    expect(isValidEmail('al ice@example.com')).toBe(false);
    expect(isValidEmail(' alice@example.com')).toBe(false);
  });

  it('rejects empty and missing-@ input', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('aliceexample.com')).toBe(false);
  });
});
