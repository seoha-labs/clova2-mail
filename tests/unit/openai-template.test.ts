import { describe, it, expect } from 'vitest';
import { resolveTemplate, applySubstitution } from '../../src/background/openai';
import type { EmailTemplate, SummaryJson } from '../../src/shared/types';

const TEMPLATES: readonly EmailTemplate[] = [
  { id: 'a', name: '영업', subject: '[영업] {title}', body: '영업 본문 {summary_bullets}' },
  { id: 'b', name: '내부', subject: '[내부] {title}', body: '내부 본문 {summary_bullets}' },
];

describe('resolveTemplate', () => {
  it('returns the template matching the requested id', () => {
    expect(resolveTemplate(TEMPLATES, 'b', 'a').id).toBe('b');
  });

  it('falls back to the active template when the requested id is unknown', () => {
    expect(resolveTemplate(TEMPLATES, 'nope', 'b').id).toBe('b');
  });

  it('falls back to the active template when no id is requested', () => {
    expect(resolveTemplate(TEMPLATES, undefined, 'a').id).toBe('a');
  });

  it('falls back to the first template when neither requested nor active id matches', () => {
    expect(resolveTemplate(TEMPLATES, 'x', 'y').id).toBe('a');
  });
});

describe('applySubstitution uses the chosen template', () => {
  const summary: SummaryJson = {
    summary_bullets: ['핵심1'],
    decisions: [],
    action_items: [],
    discussions: [],
  };

  it('substitutes into the requested template, not the active one', () => {
    const chosen = resolveTemplate(TEMPLATES, 'b', 'a');
    const result = applySubstitution(summary, chosen, '주간회의', ['김']);
    expect(result.subject).toBe('[내부] 주간회의');
    expect(result.htmlBody).toContain('내부 본문');
    expect(result.htmlBody).toContain('- 핵심1');
  });
});
