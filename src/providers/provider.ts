import { isLabel } from '../shared/labels';
import type { ElementSummary, Verdict } from '../shared/types';

export interface ProviderHealth {
  ok: boolean;
  detail: string;
  latencyMs: number;
}

export interface DecisionProvider {
  /** One verdict per state, in order; null where the answer could not be read. Rejects with ProviderError. */
  decide(states: ElementSummary[]): Promise<(Verdict | null)[]>;
  health(): Promise<ProviderHealth>;
}

/** Reads a `choice` answer ({choice, confidence, probabilities}) shared by Laya and Jev. */
export function parseChoice(answer: unknown): Verdict | null {
  if (!answer || typeof answer !== 'object') return null;
  const a = answer as { choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> };
  if (!isLabel(a.choice)) return null;
  const confidence = typeof a.confidence === 'number' ? a.confidence : a.probabilities?.[a.choice];
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return null;
  return { label: a.choice, confidence };
}
