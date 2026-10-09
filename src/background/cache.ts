import type { KV } from '../shared/storage';
import type { CacheEntry } from '../shared/types';

export type { CacheEntry };

interface HostRecord {
  used: number;
  entries: Record<string, CacheEntry>;
}

const PREFIX = 'cache:';
const DAY = 86_400_000;

/** Per-host verdict cache in chrome.storage.local with a TTL and a global LRU entry cap. */
export class VerdictCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly kv: KV,
    opts: { ttlDays: number; maxEntries?: number; now?: () => number },
  ) {
    this.ttlMs = opts.ttlDays * DAY;
    this.maxEntries = opts.maxEntries ?? 5000;
    this.now = opts.now ?? Date.now;
  }

  private fresh(entries: Record<string, CacheEntry>): Record<string, CacheEntry> {
    const cutoff = this.now() - this.ttlMs;
    return Object.fromEntries(Object.entries(entries).filter(([, e]) => e.at >= cutoff));
  }

  private async record(host: string): Promise<HostRecord | undefined> {
    const raw = (await this.kv.get(PREFIX + host))[PREFIX + host] as HostRecord | undefined;
    return raw && typeof raw === 'object' && raw.entries ? raw : undefined;
  }

  async getHost(host: string): Promise<Record<string, CacheEntry>> {
    const rec = await this.record(host);
    if (!rec) return {};
    const entries = this.fresh(rec.entries);
    await this.kv.set({ [PREFIX + host]: { used: this.now(), entries } });
    return entries;
  }

  async put(host: string, add: Record<string, CacheEntry>): Promise<void> {
    const rec = await this.record(host);
    const entries = this.fresh({ ...(rec?.entries ?? {}), ...add });
    await this.kv.set({ [PREFIX + host]: { used: this.now(), entries } });
    await this.evict(host);
  }

  private async all(): Promise<[string, HostRecord][]> {
    const everything = await this.kv.get(null);
    return Object.entries(everything)
      .filter(([k]) => k.startsWith(PREFIX))
      .map(([k, v]) => [k, v as HostRecord]);
  }

  private async evict(keep: string): Promise<void> {
    const hosts = await this.all();
    let total = hosts.reduce((n, [, r]) => n + Object.keys(r.entries ?? {}).length, 0);
    if (total <= this.maxEntries) return;
    const victims: string[] = [];
    for (const [key, rec] of hosts.sort((a, b) => a[1].used - b[1].used)) {
      if (total <= this.maxEntries) break;
      if (key === PREFIX + keep) continue;
      victims.push(key);
      total -= Object.keys(rec.entries ?? {}).length;
    }
    if (victims.length) await this.kv.remove(victims);
  }

  async count(): Promise<number> {
    return (await this.all()).reduce((n, [, r]) => n + Object.keys(r.entries ?? {}).length, 0);
  }

  async clear(): Promise<void> {
    const keys = (await this.all()).map(([k]) => k);
    if (keys.length) await this.kv.remove(keys);
  }
}
