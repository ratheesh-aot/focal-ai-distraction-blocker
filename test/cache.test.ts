import { describe, expect, it } from 'vitest';
import { VerdictCache } from '../src/background/cache';
import { memoryKV } from './memoryKV';

const DAY = 86_400_000;

function setup(opts: { maxEntries?: number } = {}) {
  let now = 1_000_000;
  const kv = memoryKV();
  const cache = new VerdictCache(kv, { ttlDays: 7, now: () => now, ...opts });
  return { kv, cache, advance: (ms: number) => (now += ms), at: () => now };
}

describe('VerdictCache', () => {
  it('returns entries stored for a host', async () => {
    const { cache, at } = setup();
    await cache.put('example.com', { sig1: { label: 'ad', confidence: 0.9, at: at() } });
    expect(await cache.getHost('example.com')).toEqual({ sig1: { label: 'ad', confidence: 0.9, at: at() } });
    expect(await cache.getHost('other.com')).toEqual({});
  });

  it('merges new entries with existing ones for the same host', async () => {
    const { cache, at } = setup();
    await cache.put('example.com', { a: { label: 'ad', confidence: 0.9, at: at() } });
    await cache.put('example.com', { b: { label: 'chat_widget', confidence: 0.8, at: at() } });
    expect(Object.keys(await cache.getHost('example.com')).sort()).toEqual(['a', 'b']);
  });

  it('drops entries older than the TTL', async () => {
    const { cache, at, advance } = setup();
    await cache.put('example.com', { old: { label: 'ad', confidence: 0.9, at: at() } });
    advance(8 * DAY);
    await cache.put('example.com', { fresh: { label: 'ad', confidence: 0.9, at: at() } });
    expect(Object.keys(await cache.getHost('example.com'))).toEqual(['fresh']);
  });

  it('evicts the least recently used hosts when over the entry limit', async () => {
    const { cache, at, advance } = setup({ maxEntries: 3 });
    await cache.put('a.com', { x: { label: 'ad', confidence: 1, at: at() }, y: { label: 'ad', confidence: 1, at: at() } });
    advance(1000);
    await cache.put('b.com', { x: { label: 'ad', confidence: 1, at: at() } });
    advance(1000);
    await cache.getHost('a.com'); // a.com is now the most recently used
    advance(1000);
    await cache.put('c.com', { x: { label: 'ad', confidence: 1, at: at() } });
    expect(await cache.getHost('b.com')).toEqual({});
    expect(Object.keys(await cache.getHost('a.com'))).toHaveLength(2);
    expect(await cache.count()).toBe(3);
  });

  it('clear() removes everything', async () => {
    const { cache, at } = setup();
    await cache.put('a.com', { x: { label: 'ad', confidence: 1, at: at() } });
    await cache.clear();
    expect(await cache.count()).toBe(0);
    expect(await cache.getHost('a.com')).toEqual({});
  });
});
