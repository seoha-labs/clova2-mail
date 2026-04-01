/**
 * Evaluation Runner
 *
 * Reads each meeting transcript sample from the dataset,
 * sends it to the OpenAI API for summarization using the same
 * system prompt as the Chrome extension, and saves the generated
 * email as an HTML file under test-results/.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-xxx npx tsx eval/runner.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { encode } from 'gpt-tokenizer';

// ---------------------------------------------------------------------------
// Constants (mirrored from src/shared/constants.ts to avoid Chrome API deps)
// ---------------------------------------------------------------------------

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

// The system prompt is intentionally kept in Korean – it is the production
// prompt shipped with the extension and must remain identical here so that
// evaluation results reflect real-world behaviour.
const SYSTEM_PROMPT = `당신은 회의 원문을 팀 공유용 이메일 초안으로 정리하는 전문가입니다.

## 목표
회의 원문을 너무 과하게 축약하지 말고, 회의의 핵심 맥락과 논의 흐름이 드러나도록 정리하세요.
단순 요약이 아니라, 실제로 팀에 공유 가능한 수준의 이메일 본문 콘텐츠를 생성해야 합니다.

## 작성 원칙
- 너무 짧게 요약하지 말 것. 회의에서 실제로 중요하게 논의된 내용은 충분히 반영할 것.
- 중복되거나 군더더기인 표현은 정리하되, 핵심 쟁점과 결론은 빠뜨리지 말 것.
- 회의 중 확정된 내용과 아직 보류된 내용을 구분해서 쓸 것.
- 기술적 논의가 포함된 경우, 왜 그 논의가 중요했는지도 드러나게 정리할 것.
- 회의 참석자 발언을 그대로 옮기기보다, 업무 문서처럼 자연스럽게 재구성할 것.
- 다만 "누가 어떤 우려를 제기했고 어떤 관점 차이가 있었는지"는 흐름상 중요하면 남길 것.
- 원문에 잡담이나 끼어드는 말이 많아도, 핵심 논의를 중심으로 재구성할 것.
- 한국어로 작성할 것.

## 출력 형식
반드시 아래 JSON 스키마에 맞게 응답하세요.

{
  "summary_bullets": [
    "회의 전체를 3~5개 bullet으로 요약. 회의 목적, 핵심 쟁점, 결론 방향이 드러나게 작성."
  ],
  "decisions": [
    "이번 회의에서 확정되었거나 잠정 합의된 사항을 각각 bullet으로 정리."
  ],
  "action_items": [
    {
      "task": "실행 가능한 수준으로 구체적으로 작성한 후속 작업 내용",
      "assignee": "담당자가 명확하면 이름, 불명확하면 역할 단위 (예: 기획팀)",
      "deadline": "기한이 명시되면 기재, 없으면 '추후 논의' 또는 '차기 논의 전'"
    }
  ],
  "discussions": [
    "회의에서 길게 논의되었지만 확정되지 않은 쟁점, 향후 추가 검토가 필요한 항목, 트레이드오프나 우려사항 등을 충분히 설명. 단순 나열이 아니라 왜 보류되었는지도 드러나게 작성."
  ],
  "inferred_variables": {
    "변수명": "유추한 값"
  }
}

## 주의사항
- 반드시 JSON 형식으로만 응답하세요.
- 발언자별 대화체를 그대로 유지하지 말고, 문서형 정리로 바꾸세요.`;

const DEFAULT_TEMPLATE = {
  subject: '[회의록] {title} ({date})',
  body: `안녕하세요.
금일 진행된 {title} 미팅 결과를 정리하여 공유드립니다.

## 회의 간단 요약
{summary_bullets}

## 주요 결정사항
{decisions}

## 실행 과제
{action_items}

## 주요 논의 및 보류 사항
{discussions}

감사합니다.`,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionItem {
  readonly task: string;
  readonly assignee: string;
  readonly deadline: string;
}

interface SummaryJson {
  readonly summary_bullets: readonly string[];
  readonly decisions: readonly string[];
  readonly action_items: readonly ActionItem[];
  readonly discussions: readonly string[];
  readonly inferred_variables?: Readonly<Record<string, string>>;
}

interface SampleData {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly title: string;
  readonly attendees: readonly string[];
  readonly transcript: string;
  readonly expected_keywords: readonly string[];
  readonly expected_subject: string;
}

interface EvalResult {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly title: string;
  readonly expected_subject: string;
  readonly actual_subject: string;
  readonly expected_keywords: readonly string[];
  readonly found_keywords: readonly string[];
  readonly missing_keywords: readonly string[];
  readonly keyword_coverage: number;
  readonly summary_json: SummaryJson;
  readonly formatted_body: string;
  readonly token_count: number;
  readonly latency_ms: number;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function callOpenAI(apiKey: string, transcript: string): Promise<SummaryJson> {
  const userMessage = `## 이메일 템플릿\n제목: ${DEFAULT_TEMPLATE.subject}\n\n${DEFAULT_TEMPLATE.body}\n\n## 회의 원문\n${transcript}`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');

  return JSON.parse(content) as SummaryJson;
}

function formatToMarkdown(
  summary: SummaryJson,
  title: string,
  attendees: readonly string[],
): { subject: string; body: string } {
  const date = new Date().toISOString().split('T')[0];

  const bullets = summary.summary_bullets.map((b) => `- ${b}`).join('\n');
  const decisions = summary.decisions.length > 0
    ? summary.decisions.map((d) => `- ${d}`).join('\n')
    : '- (확정된 사항 없음)';
  const actions = summary.action_items.length > 0
    ? summary.action_items.map((i) => `- @${i.assignee}: ${i.task} (기한: ${i.deadline})`).join('\n')
    : '- (구체적 실행 과제 없음)';
  const discussions = summary.discussions.length > 0
    ? summary.discussions.map((d) => `- ${d}`).join('\n')
    : '- (보류 사항 없음)';

  const subject = DEFAULT_TEMPLATE.subject
    .replaceAll('{title}', title)
    .replaceAll('{date}', date);

  const body = DEFAULT_TEMPLATE.body
    .replaceAll('{summary_bullets}', bullets)
    .replaceAll('{decisions}', decisions)
    .replaceAll('{action_items}', actions)
    .replaceAll('{discussions}', discussions)
    .replaceAll('{attendees}', attendees.join(', '))
    .replaceAll('{title}', title)
    .replaceAll('{date}', date);

  return { subject, body };
}

function checkKeywords(
  text: string,
  keywords: readonly string[],
): { found: string[]; missing: string[] } {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    (lower.includes(kw.toLowerCase()) ? found : missing).push(kw);
  }
  return { found, missing };
}

// ---------------------------------------------------------------------------
// HTML renderers
// ---------------------------------------------------------------------------

function renderResultHtml(r: EvalResult): string {
  const statusColor = r.error ? '#e74c3c' : r.keyword_coverage >= 0.7 ? '#27ae60' : '#f39c12';
  const statusLabel = r.error ? 'ERROR' : r.keyword_coverage >= 0.7 ? 'PASS' : 'WARN';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${r.id} - ${r.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }
    .header { border-bottom: 2px solid #eee; padding-bottom: 16px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; color: white; font-weight: bold; font-size: 14px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; font-size: 14px; color: #666; }
    .section { margin: 24px 0; }
    .section h2 { font-size: 18px; border-left: 4px solid #3498db; padding-left: 12px; }
    .keywords { display: flex; flex-wrap: wrap; gap: 6px; }
    .kw { padding: 2px 8px; border-radius: 4px; font-size: 13px; }
    .kw-found { background: #d5f5e3; color: #1e8449; }
    .kw-missing { background: #fadbd8; color: #c0392b; }
    .email-preview { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; }
    .email-subject { font-size: 16px; font-weight: bold; border-bottom: 1px solid #dee2e6; padding-bottom: 12px; margin-bottom: 12px; }
    .email-body { white-space: pre-wrap; line-height: 1.7; }
    pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    .error-box { background: #fadbd8; border: 1px solid #e74c3c; border-radius: 8px; padding: 16px; color: #c0392b; }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge" style="background:${statusColor}">${statusLabel}</span>
    <h1>${r.title}</h1>
    <div class="meta">
      <div><strong>ID:</strong> ${r.id}</div>
      <div><strong>Category:</strong> ${r.category}</div>
      <div><strong>Description:</strong> ${r.description}</div>
      <div><strong>Token Count:</strong> ${r.token_count.toLocaleString()}</div>
      <div><strong>Latency:</strong> ${r.latency_ms.toLocaleString()}ms</div>
      <div><strong>Keyword Coverage:</strong> ${(r.keyword_coverage * 100).toFixed(0)}%</div>
    </div>
  </div>

  ${r.error ? `<div class="error-box"><strong>Error:</strong> ${r.error}</div>` : ''}

  <div class="section">
    <h2>Keyword Analysis</h2>
    <div class="keywords">
      ${r.found_keywords.map((k) => `<span class="kw kw-found">${k}</span>`).join('\n      ')}
      ${r.missing_keywords.map((k) => `<span class="kw kw-missing">${k}</span>`).join('\n      ')}
    </div>
  </div>

  <div class="section">
    <h2>Email Preview</h2>
    <div class="email-preview">
      <div class="email-subject">${r.actual_subject}</div>
      <div class="email-body">${r.formatted_body}</div>
    </div>
  </div>

  <div class="section">
    <h2>Raw Summary JSON</h2>
    <pre>${JSON.stringify(r.summary_json, null, 2)}</pre>
  </div>
</body>
</html>`;
}

function renderIndexHtml(results: readonly EvalResult[]): string {
  const total = results.length;
  const passed = results.filter((r) => !r.error && r.keyword_coverage >= 0.7).length;
  const warned = results.filter((r) => !r.error && r.keyword_coverage < 0.7).length;
  const errored = results.filter((r) => r.error).length;
  const avgCoverage = results.reduce((sum, r) => sum + r.keyword_coverage, 0) / total;
  const avgLatency = results.reduce((sum, r) => sum + r.latency_ms, 0) / total;

  const rows = results.map((r) => {
    const color = r.error ? '#e74c3c' : r.keyword_coverage >= 0.7 ? '#27ae60' : '#f39c12';
    const label = r.error ? 'ERROR' : r.keyword_coverage >= 0.7 ? 'PASS' : 'WARN';
    return `<tr>
      <td><a href="${r.id}.html">${r.id}</a></td>
      <td>${r.category}</td>
      <td>${r.title}</td>
      <td><span style="color:${color};font-weight:bold">${label}</span></td>
      <td>${(r.keyword_coverage * 100).toFixed(0)}%</td>
      <td>${r.latency_ms.toLocaleString()}ms</td>
      <td>${r.token_count.toLocaleString()}</td>
    </tr>`;
  }).join('\n    ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>clova2Mail Evaluation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1100px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { border-bottom: 2px solid #3498db; padding-bottom: 12px; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-card .value { font-size: 28px; font-weight: bold; }
    .stat-card .label { font-size: 13px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { background: #f8f9fa; text-align: left; padding: 12px; border-bottom: 2px solid #dee2e6; font-size: 14px; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    tr:hover { background: #f8f9fa; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>clova2Mail Evaluation Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="stats">
    <div class="stat-card"><div class="value">${total}</div><div class="label">Total</div></div>
    <div class="stat-card"><div class="value" style="color:#27ae60">${passed}</div><div class="label">Passed</div></div>
    <div class="stat-card"><div class="value" style="color:#f39c12">${warned}</div><div class="label">Warnings</div></div>
    <div class="stat-card"><div class="value" style="color:#e74c3c">${errored}</div><div class="label">Errors</div></div>
    <div class="stat-card"><div class="value">${(avgCoverage * 100).toFixed(0)}%</div><div class="label">Avg Coverage</div></div>
  </div>

  <p><strong>Avg Latency:</strong> ${avgLatency.toFixed(0)}ms</p>

  <table>
    <thead>
      <tr><th>ID</th><th>Category</th><th>Title</th><th>Status</th><th>Keywords</th><th>Latency</th><th>Tokens</th></tr>
    </thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required.');
    console.error('  OPENAI_API_KEY=sk-xxx npx tsx eval/runner.ts');
    process.exit(1);
  }

  const evalDir = path.dirname(new URL(import.meta.url).pathname);
  const datasetPath = path.join(evalDir, 'dataset.json');
  const resultsDir = path.join(evalDir, 'test-results');

  // Clean previous results
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir)) {
      fs.unlinkSync(path.join(resultsDir, file));
    }
  } else {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const samples: SampleData[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  console.log(`\nLoaded ${samples.length} samples\n`);

  const results: EvalResult[] = [];

  for (const sample of samples) {
    process.stdout.write(`[${sample.id}] ${sample.title} ... `);
    const tokenCount = encode(sample.transcript).length;
    const startTime = Date.now();

    let result: EvalResult;

    try {
      const summaryJson = await callOpenAI(apiKey, sample.transcript);
      const latency = Date.now() - startTime;
      const { subject, body } = formatToMarkdown(summaryJson, sample.title, sample.attendees);

      // Check keywords against subject + body + raw JSON
      const fullText = `${subject}\n${body}\n${JSON.stringify(summaryJson)}`;
      const { found, missing } = checkKeywords(fullText, sample.expected_keywords);

      result = {
        id: sample.id,
        category: sample.category,
        description: sample.description,
        title: sample.title,
        expected_subject: sample.expected_subject,
        actual_subject: subject,
        expected_keywords: sample.expected_keywords,
        found_keywords: found,
        missing_keywords: missing,
        keyword_coverage: found.length / sample.expected_keywords.length,
        summary_json: summaryJson,
        formatted_body: body,
        token_count: tokenCount,
        latency_ms: latency,
        error: null,
      };

      const status = result.keyword_coverage >= 0.7 ? 'PASS' : 'WARN';
      console.log(`${status} (keywords: ${found.length}/${sample.expected_keywords.length}, ${latency}ms)`);
    } catch (err) {
      const latency = Date.now() - startTime;
      result = {
        id: sample.id,
        category: sample.category,
        description: sample.description,
        title: sample.title,
        expected_subject: sample.expected_subject,
        actual_subject: '',
        expected_keywords: sample.expected_keywords,
        found_keywords: [],
        missing_keywords: [...sample.expected_keywords],
        keyword_coverage: 0,
        summary_json: { summary_bullets: [], decisions: [], action_items: [], discussions: [] },
        formatted_body: '',
        token_count: tokenCount,
        latency_ms: latency,
        error: String(err),
      };
      console.log(`ERROR (${latency}ms): ${err}`);
    }

    results.push(result);
    fs.writeFileSync(path.join(resultsDir, `${sample.id}.html`), renderResultHtml(result), 'utf-8');

    // Throttle to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Write index page and raw JSON for the judge step
  fs.writeFileSync(path.join(resultsDir, 'index.html'), renderIndexHtml(results), 'utf-8');
  fs.writeFileSync(path.join(resultsDir, 'results.json'), JSON.stringify(results, null, 2), 'utf-8');

  // Print summary
  const passed = results.filter((r) => !r.error && r.keyword_coverage >= 0.7).length;
  const warned = results.filter((r) => !r.error && r.keyword_coverage < 0.7).length;
  const errored = results.filter((r) => r.error).length;
  const avgCoverage = results.reduce((s, r) => s + r.keyword_coverage, 0) / results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} PASS / ${warned} WARN / ${errored} ERROR`);
  console.log(`Avg Keyword Coverage: ${(avgCoverage * 100).toFixed(1)}%`);
  console.log(`Reports: ${resultsDir}/index.html`);
  console.log('='.repeat(60) + '\n');
}

main();
