import type { ProviderError } from '../providers/errors';
import type { ProviderStatus } from '../shared/types';

const FAILURES_BEFORE_BACKOFF = 3;
const BACKOFF_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60_000;

/** Tracks model health and decides when calls should pause. */
export class StatusTracker {
  private status: ProviderStatus = { state: 'unknown', calls: 0 };
  private failures = 0;
  private blockedUntil = 0;

  get(): ProviderStatus {
    return { ...this.status };
  }

  canCall(now: number): boolean {
    return this.status.state !== 'auth' && now >= this.blockedUntil;
  }

  success(latencyMs: number): void {
    this.failures = 0;
    this.blockedUntil = 0;
    this.status = { state: 'online', lastLatencyMs: latencyMs, calls: this.status.calls + 1 };
  }

  failure(err: ProviderError, now: number): void {
    const calls = this.status.calls + 1;
    if (err.kind === 'auth') {
      this.status = { state: 'auth', message: err.message, calls };
      return;
    }
    if (err.kind === 'ratelimit') {
      this.blockedUntil = now + RATE_LIMIT_BACKOFF_MS;
      this.status = { state: 'ratelimited', message: err.message, calls };
      return;
    }
    this.failures++;
    if (this.failures >= FAILURES_BEFORE_BACKOFF) this.blockedUntil = now + BACKOFF_MS;
    this.status = { state: 'offline', message: err.message, calls, lastLatencyMs: this.status.lastLatencyMs };
  }

  reset(): void {
    this.failures = 0;
    this.blockedUntil = 0;
    this.status = { state: 'unknown', calls: 0 };
  }
}
