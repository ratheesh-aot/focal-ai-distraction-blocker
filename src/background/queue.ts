import { ProviderError } from '../providers/errors';
import type { DecisionProvider } from '../providers/provider';
import type { ElementSummary, Verdict } from '../shared/types';
import type { StatusTracker } from './status';

export interface QueueItem {
  signature: string;
  summary: ElementSummary;
}

interface Waiter {
  signatures: string[];
  resolve: (verdicts: Record<string, Verdict>) => void;
}

/**
 * Collects classification requests from all tabs for `windowMs`, then sends one
 * deduplicated model call. Never rejects: failures resolve with no verdicts.
 */
export class DecisionQueue {
  private pending = new Map<string, ElementSummary>();
  private waiters: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(
    private readonly deps: { getProvider: () => DecisionProvider; status: StatusTracker; windowMs?: number; now?: () => number },
  ) {
    this.windowMs = deps.windowMs ?? 300;
    this.now = deps.now ?? Date.now;
  }

  classify(items: QueueItem[]): Promise<Record<string, Verdict>> {
    if (items.length === 0) return Promise.resolve({});
    for (const { signature, summary } of items) if (!this.pending.has(signature)) this.pending.set(signature, summary);
    const promise = new Promise<Record<string, Verdict>>((resolve) => {
      this.waiters.push({ signatures: items.map((i) => i.signature), resolve });
    });
    this.timer ??= setTimeout(() => void this.flush(), this.windowMs);
    return promise;
  }

  private async flush(): Promise<void> {
    const batch = [...this.pending];
    const waiters = this.waiters;
    this.pending = new Map();
    this.waiters = [];
    this.timer = null;

    const verdicts: Record<string, Verdict> = {};
    const { status } = this.deps;
    if (status.canCall(this.now())) {
      const started = this.now();
      try {
        const answers = await this.deps.getProvider().decide(batch.map(([, s]) => s));
        batch.forEach(([sig], i) => {
          const v = answers[i];
          if (v) verdicts[sig] = v;
        });
        status.success(this.now() - started);
      } catch (e) {
        status.failure(e instanceof ProviderError ? e : new ProviderError('network', String(e)), this.now());
      }
    }
    for (const w of waiters) {
      w.resolve(Object.fromEntries(w.signatures.filter((s) => s in verdicts).map((s) => [s, verdicts[s]])));
    }
  }
}
