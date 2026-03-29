import { encode } from 'gpt-tokenizer';
import {
  OPENAI_API_URL,
  OPENAI_MODEL,
  SYSTEM_PROMPT,
  MAX_TOKENS_SINGLE,
  MAX_TOKENS_CHUNK,
  CHUNK_SIZE,
} from '../shared/constants';
import type { SummaryJson, SummaryResult, EmailTemplate, ProgressInfo } from '../shared/types';
import { getOpenAIKey, getEmailTemplate } from '../shared/storage';

export function countTokens(text: string): number {
  return encode(text).length;
}

export function splitByParagraphs(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const combined = current ? `${current}\n\n${para}` : para;
    if (countTokens(combined) > maxTokens && current) {
      chunks.push(current);
      current = para;
    } else {
      current = combined;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const RESERVED_VARIABLES = new Set([
  'title', 'date', 'summary_bullets', 'decisions',
  'action_items', 'discussions', 'attendees',
]);

function extractCustomVariables(template: EmailTemplate): string[] {
  const allText = `${template.subject}\n${template.body}`;
  const matches = allText.matchAll(/\{(\w+)\}/g);
  const custom: string[] = [];
  for (const m of matches) {
    if (!RESERVED_VARIABLES.has(m[1]) && !custom.includes(m[1])) {
      custom.push(m[1]);
    }
  }
  return custom;
}

async function callOpenAI(tokenOrKey: string, transcript: string, template: EmailTemplate): Promise<SummaryJson> {
  const customVars = extractCustomVariables(template);
  const customVarsInstruction = customVars.length > 0
    ? `\n\n## 유추가 필요한 템플릿 변수\n아래 변수들의 값을 회의 원문에서 유추하여 inferred_variables에 반드시 포함하세요.\n변수 목록: ${customVars.map((v) => `{${v}}`).join(', ')}`
    : '';

  const userMessage = `## 이메일 템플릿\n제목: ${template.subject}\n\n${template.body}${customVarsInstruction}\n\n## 회의 원문\n${transcript}`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenOrKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${(err as Record<string, unknown>).error ?? response.statusText}`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  return JSON.parse(content) as SummaryJson;
}

function formatSummaryToMarkdown(
  summary: SummaryJson,
  template: EmailTemplate,
  title: string,
  attendees: readonly string[],
): SummaryResult {
  const date = new Date().toISOString().split('T')[0];

  const summaryBulletsText = summary.summary_bullets.map((b) => `- ${b}`).join('\n');
  const decisionsText = summary.decisions.map((d) => `- ${d}`).join('\n');
  const actionItemsText = summary.action_items
    .map((item) => `- @${item.assignee}: ${item.task} (기한: ${item.deadline})`)
    .join('\n');
  const discussionsText = summary.discussions.map((d) => `- ${d}`).join('\n');
  const attendeesText = attendees.join(', ');

  const subject = template.subject
    .replaceAll('{title}', title)
    .replaceAll('{date}', date);

  let body = template.body
    .replaceAll('{summary_bullets}', summaryBulletsText)
    .replaceAll('{decisions}', decisionsText)
    .replaceAll('{action_items}', actionItemsText)
    .replaceAll('{discussions}', discussionsText)
    .replaceAll('{attendees}', attendeesText)
    .replaceAll('{title}', title)
    .replaceAll('{date}', date);

  if (summary.inferred_variables) {
    for (const [key, value] of Object.entries(summary.inferred_variables)) {
      body = body.replaceAll(`{${key}}`, value);
    }
  }

  let filledSubject = subject;
  if (summary.inferred_variables) {
    for (const [key, value] of Object.entries(summary.inferred_variables)) {
      filledSubject = filledSubject.replaceAll(`{${key}}`, value);
    }
  }

  return {
    subject: filledSubject,
    htmlBody: body,
    plainBody: body,
  };
}

async function mergeSummaries(
  tokenOrKey: string,
  partials: readonly SummaryJson[],
  template: EmailTemplate,
): Promise<SummaryJson> {
  const mergePrompt = `아래는 긴 회의록을 구간별로 정리한 결과들입니다.
이들을 하나의 통합 정리본으로 합성해 주세요. 동일한 JSON 스키마를 사용하세요.
중복된 결정사항이나 실행 과제는 병합하고, 회의 간단 요약과 논의 사항은 전체 흐름에 맞게 새로 작성하세요.

${partials.map((p, i) => `### 구간 ${i + 1}\n${JSON.stringify(p, null, 2)}`).join('\n\n')}`;

  return await callOpenAI(tokenOrKey, mergePrompt, template);
}

export async function summarizeTranscript(
  transcript: string,
  meetingTitle: string,
  attendees: readonly string[] = [],
  onProgress?: (progress: ProgressInfo) => void,
): Promise<SummaryResult> {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    throw new Error('OpenAI API key가 설정되지 않았습니다. 확장 프로그램 설정에서 API key를 입력하세요.');
  }

  const template = await getEmailTemplate();
  const tokenCount = countTokens(transcript);

  if (tokenCount > MAX_TOKENS_CHUNK) {
    throw new Error(
      `이 회의록은 너무 길어서 처리할 수 없습니다 (약 ${tokenCount.toLocaleString()} 토큰). ` +
      `${MAX_TOKENS_CHUNK.toLocaleString()} 토큰 이내의 회의록만 지원됩니다.`,
    );
  }

  if (tokenCount <= MAX_TOKENS_SINGLE) {
    const summary = await callOpenAI(apiKey, transcript, template);
    return formatSummaryToMarkdown(summary, template, meetingTitle, attendees);
  }

  // Chunk-Summarize-Merge (병렬 처리)
  const chunks = splitByParagraphs(transcript, CHUNK_SIZE);
  let completed = 0;

  const partialSummaries = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await callOpenAI(apiKey, chunk, template);
      completed += 1;
      onProgress?.({ current: completed, total: chunks.length });
      return result;
    }),
  );

  const merged = await mergeSummaries(apiKey, partialSummaries, template);
  return formatSummaryToMarkdown(merged, template, meetingTitle, attendees);
}

