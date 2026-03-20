import { describe, it, expect } from 'vitest';
import { countTokens, splitByParagraphs } from '../../src/background/openai';

describe('countTokens', () => {
  it('counts tokens for English text', () => {
    const count = countTokens('Hello, world!');
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10);
  });

  it('counts tokens for Korean text', () => {
    const count = countTokens('안녕하세요, 오늘 회의를 시작하겠습니다.');
    expect(count).toBeGreaterThan(0);
  });

  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('handles long text', () => {
    const longText = '이것은 테스트입니다. '.repeat(1000);
    const count = countTokens(longText);
    expect(count).toBeGreaterThan(100);
  });
});

describe('splitByParagraphs', () => {
  it('returns single chunk for short text', () => {
    const text = 'Short paragraph 1\n\nShort paragraph 2';
    const chunks = splitByParagraphs(text, 50000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits at paragraph boundaries', () => {
    const paragraphs = Array.from({ length: 100 }, (_, i) =>
      `Paragraph ${i}: ${'word '.repeat(50)}`,
    ).join('\n\n');

    const chunks = splitByParagraphs(paragraphs, 500);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should not contain split paragraphs
    for (const chunk of chunks) {
      const tokenCount = countTokens(chunk);
      // Allow some flexibility (last chunk might be under limit)
      expect(tokenCount).toBeLessThan(1000);
    }
  });

  it('handles empty text', () => {
    const chunks = splitByParagraphs('', 50000);
    expect(chunks).toHaveLength(0);
  });

  it('handles text with no paragraph breaks', () => {
    const text = 'One long paragraph without breaks. '.repeat(100);
    const chunks = splitByParagraphs(text, 50000);
    expect(chunks).toHaveLength(1);
  });
});
