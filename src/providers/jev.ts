import { buildQuestions } from '../shared/labels';
import type { ElementSummary, Settings, Verdict } from '../shared/types';
import { fetchJson, ProviderError } from './errors';
import { parseChoice, type DecisionProvider } from './provider';

export const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';
const CONCURRENCY = 4;

/** TypeSafe Jev through OpenRouter's Decisions API: one state per request, no batch endpoint. */
export function createJevProvider(
  cfg: Settings['jev'],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8000,
): DecisionProvider {
  const questions = buildQuestions();

  async function decideOne(state: ElementSummary): Promise<Verdict | null> {
    if (!cfg.apiKey) throw new ProviderError('auth', 'Add your OpenRouter API key in Settings to use Jev');
    const res = (await fetchJson(
      fetchImpl,
      JEV_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, state, questions }),
      },
      timeoutMs,
    )) as { answers?: { kind?: unknown } };
    return parseChoice(res?.answers?.kind);
  }

  return {
    async decide(states) {
      const out: (Verdict | null)[] = new Array(states.length).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < states.length) {
          const i = next++;
          out[i] = await decideOne(states[i]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, states.length) }, worker));
      return out;
    },

    async health() {
      const started = Date.now();
      const v = await decideOne({ tag: 'div', position: 'fixed bottom', text: 'We use cookies. Accept all / Reject all' });
      return { ok: v !== null, detail: `Jev ${cfg.model} answered: ${v?.label ?? 'unreadable answer'}`, latencyMs: Date.now() - started };
    },
  };
}
