import { buildQuestions } from '../shared/labels';
import type { ElementSummary, Settings, Verdict } from '../shared/types';
import { fetchJson, ProviderError } from './errors';
import { parseChoice, type DecisionProvider } from './provider';

/** laya-api accepts 64, but on CPU (~0.8 s/element) 64 would exceed its 30 s request timeout. */
const MAX_BATCH = 24;
const HEADERS = { 'content-type': 'application/json' };

/** Laya decision server (laya-api). No authentication in v1 — see README "Future work". */
export function createLayaProvider(
  cfg: Settings['laya'],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15000,
  perItemMs = 1500,
): DecisionProvider {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const questions = buildQuestions();
  let batchSupported = true;

  const post = (path: string, body: unknown, items = 1) =>
    fetchJson(
      fetchImpl,
      `${base}${path}`,
      { method: 'POST', headers: HEADERS, body: JSON.stringify(body) },
      timeoutMs + perItemMs * items,
    );

  async function decideOne(state: ElementSummary): Promise<Verdict | null> {
    const res = (await post('/v1/predict', { state, questions, model: cfg.model })) as { answers?: { kind?: unknown } };
    return parseChoice(res?.answers?.kind);
  }

  async function decideChunk(chunk: ElementSummary[]): Promise<(Verdict | null)[]> {
    if (batchSupported) {
      try {
        const res = (await post('/v1/predict/batch', { states: chunk, questions, model: cfg.model }, chunk.length)) as {
          results?: { answers?: { kind?: unknown } }[];
        };
        if (!Array.isArray(res?.results) || res.results.length !== chunk.length) {
          throw new ProviderError('bad_response', 'Batch response does not match the request');
        }
        return res.results.map((r) => parseChoice(r?.answers?.kind));
      } catch (e) {
        if (!(e instanceof ProviderError && e.status === 404)) throw e;
        batchSupported = false;
      }
    }
    const out: (Verdict | null)[] = [];
    for (const state of chunk) out.push(await decideOne(state));
    return out;
  }

  return {
    async decide(states) {
      const out: (Verdict | null)[] = [];
      for (let i = 0; i < states.length; i += MAX_BATCH) out.push(...(await decideChunk(states.slice(i, i + MAX_BATCH))));
      return out;
    },

    async health() {
      const started = Date.now();
      const res = (await fetchJson(fetchImpl, `${base}/health`, { method: 'GET' }, timeoutMs)) as {
        status?: string;
        device?: string;
        loaded?: string[];
      };
      return {
        ok: res?.status === 'ok',
        detail: `Laya ${res?.status ?? 'unknown'} on ${res?.device ?? 'unknown device'}, loaded: ${(res?.loaded ?? []).join(', ') || 'none'}`,
        latencyMs: Date.now() - started,
      };
    },
  };
}
