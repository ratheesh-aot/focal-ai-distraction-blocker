// Runs labelled element summaries through a real Laya server and reports accuracy and latency.
// Usage: npm run live-check -- [baseUrl] [checkpoint]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLayaProvider } from '../src/providers/laya';
import type { ElementSummary, Label, Settings } from '../src/shared/types';

const baseUrl = process.argv[2] ?? 'http://localhost:8002';
const model = (process.argv[3] ?? 'english') as Settings['laya']['model'];
const fixtures = JSON.parse(readFileSync(resolve(import.meta.dirname, '../test/fixtures/summaries.json'), 'utf8')) as {
  expected: Label;
  summary: ElementSummary;
}[];

const provider = createLayaProvider({ baseUrl, model }, fetch, 120_000);
console.log(`Laya ${baseUrl} (${model}) — ${fixtures.length} elements in one batch`);
const started = Date.now();
const verdicts = await provider.decide(fixtures.map((f) => f.summary));
const ms = Date.now() - started;

let correct = 0;
fixtures.forEach((f, i) => {
  const v = verdicts[i];
  const ok = v?.label === f.expected;
  if (ok) correct++;
  console.log(`${ok ? 'ok  ' : 'MISS'} expected ${f.expected.padEnd(22)} got ${(v?.label ?? 'none').padEnd(22)} ${v ? v.confidence.toFixed(2) : ''}`);
});
console.log(`\naccuracy ${correct}/${fixtures.length} (${Math.round((correct / fixtures.length) * 100)}%), ${ms} ms total, ${Math.round(ms / fixtures.length)} ms per element`);
