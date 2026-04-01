/**
 * LLM-as-a-Judge Scoring System
 *
 * Reads the results.json produced by runner.ts, then uses a stronger
 * model (default: gpt-4o) to score each summary email against the
 * original transcript on five quality dimensions.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-xxx npx tsx eval/judge.ts
 *
 * Environment variables:
 *   OPENAI_API_KEY  - OpenAI API key (required)
 *   JUDGE_MODEL     - Model used for scoring (default: gpt-4o)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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
}

interface EvalResult {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly title: string;
  readonly formatted_body: string;
  readonly summary_json: SummaryJson;
  readonly keyword_coverage: number;
  readonly latency_ms: number;
  readonly error: string | null;
}

interface SampleData {
  readonly id: string;
  readonly transcript: string;
  readonly expected_keywords: readonly string[];
}

interface JudgeScore {
  readonly completeness: number;       // 1-5: key decisions omitted?
  readonly format_quality: number;     // 1-5: professional email format
  readonly hallucination: boolean;     // fabricated content detected?
  readonly hallucination_details: string;
  readonly clarity: number;            // 1-5: readability & logical flow
  readonly actionability: number;      // 1-5: specificity of action items
  readonly reasoning: string;          // brief justification
}

interface JudgedResult {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly keyword_coverage: number;
  readonly scores: JudgeScore;
  readonly total_score: number;        // weighted sum out of 20
  readonly grade: string;              // A/B/C/D/F
}

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------

// The judge prompt is in Korean because both the transcript and the summary
// are Korean. A Korean-language rubric produces more accurate assessments
// when the source material is Korean.
const JUDGE_SYSTEM_PROMPT = `당신은 회의록 요약 이메일의 품질을 평가하는 전문 채점관입니다.

원본 회의록과 그에 대한 AI 요약 이메일을 비교하여 아래 5개 기준으로 채점하세요.

## 채점 기준

### 1. completeness (1-5): 핵심 내용 누락 여부
- 5: 모든 핵심 결정사항, 실행 과제, 주요 논의가 빠짐없이 포함됨
- 4: 대부분 포함되나 사소한 세부사항 1-2개 누락
- 3: 주요 내용은 포함되나 중요한 항목 1-2개 누락
- 2: 여러 핵심 내용이 누락됨
- 1: 대부분의 핵심 내용이 누락됨

### 2. format_quality (1-5): 이메일 격식 및 형식
- 5: 전문적인 비즈니스 이메일 형식, 구조적이고 읽기 쉬움
- 4: 대체로 적절하나 사소한 형식 문제 존재
- 3: 기본 형식은 갖추었으나 전문성이 부족
- 2: 형식이 불완전하거나 비전문적
- 1: 이메일 형식으로 부적절

### 3. hallucination: 환각(없는 내용 지어내기) 여부
- false: 원본에 존재하는 내용만 포함
- true: 원본에 없는 사실, 수치, 이름, 날짜 등이 추가됨

### 4. clarity (1-5): 명확성 및 가독성
- 5: 누가 읽어도 바로 이해 가능, 논리적 흐름이 완벽
- 4: 대체로 명확하나 일부 표현이 모호
- 3: 이해는 가능하나 개선의 여지가 많음
- 2: 혼란스러운 부분이 다수
- 1: 이해하기 매우 어려움

### 5. actionability (1-5): 실행 과제의 구체성
- 5: 담당자, 기한, 구체적 작업 내용이 모두 명확
- 4: 대부분 구체적이나 1-2개 모호
- 3: 기본적인 실행 과제는 있으나 구체성 부족
- 2: 실행 과제가 너무 추상적
- 1: 실행 가능한 과제가 거의 없음

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요:

{
  "completeness": <1-5>,
  "format_quality": <1-5>,
  "hallucination": <true/false>,
  "hallucination_details": "<환각이 있다면 구체적으로 어떤 내용이 지어졌는지, 없다면 빈 문자열>",
  "clarity": <1-5>,
  "actionability": <1-5>,
  "reasoning": "<전체 채점 근거를 2-3문장으로 설명>"
}`;

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

async function judgeOne(
  apiKey: string,
  transcript: string,
  emailBody: string,
  summaryJson: SummaryJson,
): Promise<JudgeScore> {
  const userMessage = `## 원본 회의록
${transcript}

## AI 요약 이메일
${emailBody}

## AI 요약 JSON (참고용)
${JSON.stringify(summaryJson, null, 2)}

위 원본 회의록과 AI 요약 이메일을 비교하여 채점해주세요.`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Judge API error: ${response.status} ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Judge returned empty response');

  return JSON.parse(content) as JudgeScore;
}

function calculateTotal(scores: JudgeScore): number {
  // 20-point scale: 4 dimensions x 5 points each.
  // Hallucination incurs a -5 penalty.
  const base = scores.completeness + scores.format_quality + scores.clarity + scores.actionability;
  return scores.hallucination ? Math.max(0, base - 5) : base;
}

function getGrade(total: number): string {
  if (total >= 18) return 'A';
  if (total >= 15) return 'B';
  if (total >= 12) return 'C';
  if (total >= 8) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Report renderer
// ---------------------------------------------------------------------------

function renderJudgeReport(judged: readonly JudgedResult[]): string {
  const avgTotal = judged.reduce((s, r) => s + r.total_score, 0) / judged.length;
  const hallCount = judged.filter((r) => r.scores.hallucination).length;
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of judged) {
    gradeDistribution[r.grade as keyof typeof gradeDistribution]++;
  }

  const rows = judged.map((r) => {
    const gradeColor = { A: '#27ae60', B: '#2ecc71', C: '#f39c12', D: '#e67e22', F: '#e74c3c' }[r.grade] ?? '#333';
    return `<tr>
      <td>${r.id}</td>
      <td>${r.category}</td>
      <td>${r.title}</td>
      <td style="color:${gradeColor};font-weight:bold;font-size:18px">${r.grade}</td>
      <td>${r.total_score}/20</td>
      <td>${r.scores.completeness}</td>
      <td>${r.scores.format_quality}</td>
      <td>${r.scores.clarity}</td>
      <td>${r.scores.actionability}</td>
      <td style="color:${r.scores.hallucination ? '#e74c3c' : '#27ae60'};font-weight:bold">
        ${r.scores.hallucination ? 'Yes' : 'No'}
      </td>
      <td style="font-size:12px;max-width:300px">${r.scores.reasoning}</td>
    </tr>`;
  }).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>clova2Mail Judge Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1400px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { border-bottom: 2px solid #9b59b6; padding-bottom: 12px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-card .value { font-size: 28px; font-weight: bold; }
    .stat-card .label { font-size: 13px; color: #666; margin-top: 4px; }
    .grade-dist { display: flex; gap: 12px; justify-content: center; margin: 16px 0; }
    .grade-dist .item { text-align: center; }
    .grade-dist .count { font-size: 24px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
    th { background: #f8f9fa; text-align: left; padding: 10px; border-bottom: 2px solid #dee2e6; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:hover { background: #f8f9fa; }
    .legend { margin-top: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>clova2Mail LLM-as-a-Judge Report</h1>
  <p>Generated: ${new Date().toISOString()} | Judge Model: ${JUDGE_MODEL}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="value">${avgTotal.toFixed(1)}/20</div>
      <div class="label">Avg Score</div>
    </div>
    <div class="stat-card">
      <div class="value" style="color:${hallCount === 0 ? '#27ae60' : '#e74c3c'}">${hallCount}</div>
      <div class="label">Hallucinations</div>
    </div>
    <div class="stat-card">
      <div class="value">${judged.length}</div>
      <div class="label">Total Samples</div>
    </div>
    <div class="stat-card">
      <div class="value">${((judged.filter((r) => r.grade === 'A' || r.grade === 'B').length / judged.length) * 100).toFixed(0)}%</div>
      <div class="label">A+B Rate</div>
    </div>
  </div>

  <div class="grade-dist">
    <div class="item"><div class="count" style="color:#27ae60">${gradeDistribution.A}</div><div>A</div></div>
    <div class="item"><div class="count" style="color:#2ecc71">${gradeDistribution.B}</div><div>B</div></div>
    <div class="item"><div class="count" style="color:#f39c12">${gradeDistribution.C}</div><div>C</div></div>
    <div class="item"><div class="count" style="color:#e67e22">${gradeDistribution.D}</div><div>D</div></div>
    <div class="item"><div class="count" style="color:#e74c3c">${gradeDistribution.F}</div><div>F</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Category</th>
        <th>Title</th>
        <th>Grade</th>
        <th>Score</th>
        <th>Complete</th>
        <th>Format</th>
        <th>Clarity</th>
        <th>Action</th>
        <th>Halluc.</th>
        <th>Reasoning</th>
      </tr>
    </thead>
    <tbody>
    ${rows}
    </tbody>
  </table>

  <div class="legend">
    <strong>Scoring:</strong>
    Completeness(5) + Format(5) + Clarity(5) + Actionability(5) = 20 max | Hallucination = -5 penalty<br>
    <strong>Grades:</strong> A(18+) B(15+) C(12+) D(8+) F(&lt;8)
  </div>
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
    process.exit(1);
  }

  const evalDir = path.dirname(new URL(import.meta.url).pathname);
  const resultsPath = path.join(evalDir, 'test-results', 'results.json');
  const datasetPath = path.join(evalDir, 'dataset.json');

  if (!fs.existsSync(resultsPath)) {
    console.error('Error: results.json not found. Run runner.ts first.');
    process.exit(1);
  }

  const results: EvalResult[] = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const samples: SampleData[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const sampleMap = new Map(samples.map((s) => [s.id, s]));

  console.log(`\nJudging ${results.length} results (model: ${JUDGE_MODEL})\n`);

  const judged: JudgedResult[] = [];

  for (const result of results) {
    if (result.error) {
      console.log(`[${result.id}] SKIP (runner error)`);
      judged.push({
        id: result.id,
        category: result.category,
        title: result.title,
        keyword_coverage: 0,
        scores: {
          completeness: 0,
          format_quality: 0,
          hallucination: false,
          hallucination_details: '',
          clarity: 0,
          actionability: 0,
          reasoning: `Runner error: ${result.error}`,
        },
        total_score: 0,
        grade: 'F',
      });
      continue;
    }

    const sample = sampleMap.get(result.id);
    if (!sample) {
      console.log(`[${result.id}] SKIP (sample not found in dataset)`);
      continue;
    }

    process.stdout.write(`[${result.id}] ${result.title} ... `);

    try {
      const scores = await judgeOne(apiKey, sample.transcript, result.formatted_body, result.summary_json);
      const total = calculateTotal(scores);
      const grade = getGrade(total);

      judged.push({
        id: result.id,
        category: result.category,
        title: result.title,
        keyword_coverage: result.keyword_coverage,
        scores,
        total_score: total,
        grade,
      });

      const hallLabel = scores.hallucination ? ' [HALLUCINATION]' : '';
      console.log(`${grade} (${total}/20)${hallLabel}`);
    } catch (err) {
      console.log(`ERROR: ${err}`);
      judged.push({
        id: result.id,
        category: result.category,
        title: result.title,
        keyword_coverage: result.keyword_coverage,
        scores: {
          completeness: 0,
          format_quality: 0,
          hallucination: false,
          hallucination_details: '',
          clarity: 0,
          actionability: 0,
          reasoning: `Judge error: ${err}`,
        },
        total_score: 0,
        grade: 'F',
      });
    }

    // Throttle to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // Save results
  const resultsDir = path.join(evalDir, 'test-results');
  fs.writeFileSync(path.join(resultsDir, 'judge-results.json'), JSON.stringify(judged, null, 2), 'utf-8');
  fs.writeFileSync(path.join(resultsDir, 'judge-report.html'), renderJudgeReport(judged), 'utf-8');

  // Print summary
  const avgTotal = judged.reduce((s, r) => s + r.total_score, 0) / judged.length;
  const hallCount = judged.filter((r) => r.scores.hallucination).length;
  const abCount = judged.filter((r) => r.grade === 'A' || r.grade === 'B').length;

  console.log('\n' + '='.repeat(60));
  console.log(`Judge Results (${JUDGE_MODEL})`);
  console.log(`  Average Score : ${avgTotal.toFixed(1)}/20`);
  console.log(`  A+B Rate      : ${abCount}/${judged.length} (${((abCount / judged.length) * 100).toFixed(0)}%)`);
  console.log(`  Hallucinations: ${hallCount}/${judged.length}`);
  console.log(`  Report        : ${resultsDir}/judge-report.html`);
  console.log('='.repeat(60) + '\n');
}

main();
