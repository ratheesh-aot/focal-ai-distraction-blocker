import { describe, expect, it } from 'vitest';
import { DecisionQueue } from '../src/background/queue';
import { StatusTracker } from '../src/background/status';
import { ProviderError } from '../src/providers/errors';
import type { DecisionProvider } from '../src/providers/provider';
import type { ElementSummary, Verdict } from '../src/shared/types';

const item = (sig: string) => ({ signature: sig, summary: { tag: 'div', position: 'static', text: sig } as ElementSummary });

function provider(decide: (states: ElementSummary[]) => Promise<(Verdict | null)[]>) {
  const calls: ElementSummary[][] = [];
  const p: DecisionProvider = {
    decide: async (states) => {
      calls.push(states);
      return decide(states);
    },
    health: async () => ({ ok: true, detail: '', latencyMs: 0 }),
  };
  return { p, calls };
}

describe('DecisionQueue', () => {
  it('merges requests that arrive within the window into one model call, without duplicates', async () => {
    const { p, calls } = provider(async (states) => states.map(() => ({ label: 'ad', confidence: 0.9 })));
    const status = new StatusTracker();
    const q = new DecisionQueue({ getProvider: () => p, status, windowMs: 20 });
    const [a, b] = await Promise.all([q.classify([item('x'), item('y')]), q.classify([item('y'), item('z')])]);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((s) => s.text)).toEqual(['x', 'y', 'z']);
    expect(Object.keys(a)).toEqual(['x', 'y']);
    expect(Object.keys(b)).toEqual(['y', 'z']);
    expect(status.get().state).toBe('online');
    expect(status.get().calls).toBe(1);
  });

  it('resolves with no verdicts and marks the model offline when the server is down', async () => {
    const { p } = provider(async () => {
      throw new ProviderError('network', 'Cannot reach http://localhost:8002');
    });
    const status = new StatusTracker();
    const q = new DecisionQueue({ getProvider: () => p, status, windowMs: 1 });
    expect(await q.classify([item('x')])).toEqual({});
    expect(status.get().state).toBe('offline');
  });

  it('skips unreadable answers', async () => {
    const { p } = provider(async () => [null, { label: 'chat_widget', confidence: 0.7 }]);
    const q = new DecisionQueue({ getProvider: () => p, status: new StatusTracker(), windowMs: 1 });
    expect(await q.classify([item('x'), item('y')])).toEqual({ y: { label: 'chat_widget', confidence: 0.7 } });
  });

  it('does not call the model while backing off', async () => {
    const { p, calls } = provider(async (s) => s.map(() => ({ label: 'ad', confidence: 1 })));
    const status = new StatusTracker();
    status.failure(new ProviderError('auth', 'bad key', 401), Date.now());
    const q = new DecisionQueue({ getProvider: () => p, status, windowMs: 1 });
    expect(await q.classify([item('x')])).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it('treats an unexpected exception as a network failure', async () => {
    const { p } = provider(async () => {
      throw new Error('boom');
    });
    const status = new StatusTracker();
    const q = new DecisionQueue({ getProvider: () => p, status, windowMs: 1 });
    expect(await q.classify([item('x')])).toEqual({});
    expect(status.get().state).toBe('offline');
  });
});

describe('StatusTracker', () => {
  it('backs off for 60 s after 3 consecutive failures', () => {
    const s = new StatusTracker();
    const t = 1_000_000;
    s.failure(new ProviderError('network', 'x'), t);
    s.failure(new ProviderError('timeout', 'x'), t);
    expect(s.canCall(t)).toBe(true);
    s.failure(new ProviderError('network', 'x'), t);
    expect(s.canCall(t + 59_000)).toBe(false);
    expect(s.canCall(t + 60_000)).toBe(true);
  });

  it('a success resets the failure count', () => {
    const s = new StatusTracker();
    s.failure(new ProviderError('network', 'x'), 0);
    s.failure(new ProviderError('network', 'x'), 0);
    s.success(900);
    s.failure(new ProviderError('network', 'x'), 0);
    expect(s.canCall(1)).toBe(true);
    expect(s.get().lastLatencyMs).toBe(900);
  });

  it('stops calling after an auth error until reset', () => {
    const s = new StatusTracker();
    s.failure(new ProviderError('auth', 'bad key', 401), 0);
    expect(s.get().state).toBe('auth');
    expect(s.canCall(10 ** 12)).toBe(false);
    s.reset();
    expect(s.canCall(0)).toBe(true);
  });

  it('backs off 5 minutes when rate limited', () => {
    const s = new StatusTracker();
    s.failure(new ProviderError('ratelimit', 'slow down', 429), 0);
    expect(s.get().state).toBe('ratelimited');
    expect(s.canCall(299_000)).toBe(false);
    expect(s.canCall(300_000)).toBe(true);
  });
});
