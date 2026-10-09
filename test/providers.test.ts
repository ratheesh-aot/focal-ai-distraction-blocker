import { describe, expect, it } from 'vitest';
import { ProviderError } from '../src/providers/errors';
import { createJevProvider } from '../src/providers/jev';
import { createLayaProvider } from '../src/providers/laya';
import { parseChoice } from '../src/providers/provider';
import type { ElementSummary } from '../src/shared/types';

interface Call {
  url: string;
  init: RequestInit;
  body: any;
}

/** Records requests and answers them with `respond(call)`. */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const impl = async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      return await respond(call);
    } finally {
      inFlight--;
    }
  };
  return { impl: impl as typeof fetch, calls, maxInFlight: () => maxInFlight };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (label: string, confidence = 0.8) => ({ kind: { choice: label, confidence, probabilities: { [label]: confidence } } });
const states = (n: number): ElementSummary[] => Array.from({ length: n }, (_, i) => ({ tag: 'div', position: 'static', text: `item ${i}` }));

const laya = { baseUrl: 'http://localhost:8002', model: 'english' as const };

describe('Laya provider', () => {
  it('posts states, the choice question and the checkpoint to /v1/predict/batch without auth', async () => {
    const f = fakeFetch((c) => json({ results: c.body.states.map(() => ({ answers: answer('ad') })) }));
    const verdicts = await createLayaProvider(laya, f.impl).decide(states(2));
    expect(f.calls[0].url).toBe('http://localhost:8002/v1/predict/batch');
    expect(f.calls[0].body.model).toBe('english');
    expect(f.calls[0].body.states).toHaveLength(2);
    expect(f.calls[0].body.questions.kind.type).toBe('choice');
    const headers = new Headers(f.calls[0].init.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(verdicts).toEqual([{ label: 'ad', confidence: 0.8 }, { label: 'ad', confidence: 0.8 }]);
  });

  it('splits more than 64 states into chunks and keeps the order', async () => {
    const f = fakeFetch((c) => json({ results: c.body.states.map((s: ElementSummary) => ({ answers: answer(s.text === 'item 69' ? 'chat_widget' : 'ad') })) }));
    const verdicts = await createLayaProvider(laya, f.impl).decide(states(70));
    expect(f.calls.map((c) => c.body.states.length)).toEqual([64, 6]);
    expect(verdicts).toHaveLength(70);
    expect(verdicts[69]?.label).toBe('chat_widget');
  });

  it('falls back to one /v1/predict call per state when the batch endpoint is missing', async () => {
    const f = fakeFetch((c) => (c.url.endsWith('/batch') ? json({ detail: 'Not Found' }, 404) : json({ answers: answer('cookie_consent') })));
    const verdicts = await createLayaProvider(laya, f.impl).decide(states(3));
    expect(f.calls.map((c) => c.url.replace('http://localhost:8002', ''))).toEqual([
      '/v1/predict/batch',
      '/v1/predict',
      '/v1/predict',
      '/v1/predict',
    ]);
    expect(f.calls[1].body.state).toEqual(states(3)[0]);
    expect(verdicts.every((v) => v?.label === 'cookie_consent')).toBe(true);
  });

  it('accepts a base URL with a trailing slash', async () => {
    const f = fakeFetch((c) => json({ results: c.body.states.map(() => ({ answers: answer('ad') })) }));
    await createLayaProvider({ ...laya, baseUrl: 'http://localhost:8002/' }, f.impl).decide(states(1));
    expect(f.calls[0].url).toBe('http://localhost:8002/v1/predict/batch');
  });

  it('reports 401 as an auth error', async () => {
    const f = fakeFetch(() => json({ detail: 'no' }, 401));
    await expect(createLayaProvider(laya, f.impl).decide(states(1))).rejects.toMatchObject({ kind: 'auth', status: 401 });
  });

  it('reports a refused connection as a network error', async () => {
    const impl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const err = await createLayaProvider(laya, impl).decide(states(1)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('network');
  });

  it('reports a slow server as a timeout', async () => {
    const impl = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    await expect(createLayaProvider(laya, impl, 10).decide(states(1))).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('returns null for an answer it cannot read', async () => {
    const f = fakeFetch(() => json({ results: [{ answers: { kind: { choice: 'banana' } } }, { answers: answer('ad') }] }));
    expect(await createLayaProvider(laya, f.impl).decide(states(2))).toEqual([null, { label: 'ad', confidence: 0.8 }]);
  });

  it('health() reads /health', async () => {
    const f = fakeFetch(() => json({ status: 'ok', device: 'torch-cpu', loaded: ['english'] }));
    const h = await createLayaProvider(laya, f.impl).health();
    expect(f.calls[0].url).toBe('http://localhost:8002/health');
    expect(h.ok).toBe(true);
    expect(h.detail).toContain('torch-cpu');
  });
});

describe('Jev provider', () => {
  const jev = { apiKey: 'sk-or-test', model: '~typesafe/jev-latest' };

  it('sends one request per state with Bearer auth and the model id', async () => {
    const f = fakeFetch(() => json({ answers: answer('signup_modal', 0.7) }));
    const verdicts = await createJevProvider(jev, f.impl).decide(states(2));
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(new Headers(f.calls[0].init.headers).get('authorization')).toBe('Bearer sk-or-test');
    expect(f.calls[0].body.model).toBe('~typesafe/jev-latest');
    expect(f.calls[0].body.state).toEqual(states(2)[0]);
    expect(verdicts).toEqual([
      { label: 'signup_modal', confidence: 0.7 },
      { label: 'signup_modal', confidence: 0.7 },
    ]);
  });

  it('keeps at most 4 requests in flight', async () => {
    const f = fakeFetch(() => json({ answers: answer('ad') }));
    await createJevProvider(jev, f.impl).decide(states(10));
    expect(f.calls).toHaveLength(10);
    expect(f.maxInFlight()).toBeLessThanOrEqual(4);
  });

  it('reports 429 and 402 as rate limiting', async () => {
    for (const status of [429, 402]) {
      const f = fakeFetch(() => json({ error: { code: status } }, status));
      await expect(createJevProvider(jev, f.impl).decide(states(1))).rejects.toMatchObject({ kind: 'ratelimit' });
    }
  });
});

describe('parseChoice', () => {
  it('reads a choice answer', () => {
    expect(parseChoice({ choice: 'ad', confidence: 0.6 })).toEqual({ label: 'ad', confidence: 0.6 });
  });
  it('falls back to the chosen label probability when confidence is missing', () => {
    expect(parseChoice({ choice: 'ad', probabilities: { ad: 0.7 } })).toEqual({ label: 'ad', confidence: 0.7 });
  });
  it('rejects unknown labels and junk', () => {
    expect(parseChoice({ choice: 'banana', confidence: 1 })).toBeNull();
    expect(parseChoice(null)).toBeNull();
  });
});
