import { CATEGORIES } from '../shared/labels';
import type { KV } from '../shared/storage';
import type { Category, Settings } from '../shared/types';

const KEY = 'settings';
const LAYA_MODELS = ['english', 'typed-decisions', 'multilingual'] as const;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'laya',
  laya: { baseUrl: 'http://localhost:8002', model: 'english' },
  jev: { apiKey: '', model: '~typesafe/jev-latest' },
  categories: Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<Category, boolean>,
  cookieMode: 'reject',
  threshold: 0.55,
  networkBlocking: true,
  disabledSites: [],
  debug: false,
  cacheTtlDays: 7,
};

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normaliseSite(site: string): string {
  return site
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

/** Adds a site (host or full URL) to the exclude list; ignores blanks and duplicates. */
export function addExcluded(list: string[], input: string): string[] {
  const site = normaliseSite(input);
  return !site || list.includes(site) ? list : [...list, site];
}

export function removeExcluded(list: string[], input: string): string[] {
  const site = normaliseSite(input);
  return list.filter((s) => s !== site);
}

/** Stored data → complete, valid Settings. Unknown or corrupt fields fall back to defaults. */
export function mergeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return structuredClone(d);
  const laya = isObj(raw.laya) ? raw.laya : {};
  const jev = isObj(raw.jev) ? raw.jev : {};
  const cats = isObj(raw.categories) ? raw.categories : {};
  return {
    provider: raw.provider === 'jev' || raw.provider === 'laya' ? raw.provider : d.provider,
    laya: {
      baseUrl: str(laya.baseUrl, d.laya.baseUrl).trim(),
      model: (LAYA_MODELS as readonly string[]).includes(laya.model) ? laya.model : d.laya.model,
    },
    jev: { apiKey: str(jev.apiKey, d.jev.apiKey).trim(), model: str(jev.model, d.jev.model).trim() || d.jev.model },
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, bool(cats[c], true)])) as Record<Category, boolean>,
    cookieMode: raw.cookieMode === 'hide' ? 'hide' : 'reject',
    threshold: clamp(num(raw.threshold, d.threshold), 0.3, 0.95),
    networkBlocking: bool(raw.networkBlocking, d.networkBlocking),
    disabledSites: Array.isArray(raw.disabledSites)
      ? [...new Set(raw.disabledSites.filter((s): s is string => typeof s === 'string').map(normaliseSite).filter(Boolean))]
      : [],
    debug: bool(raw.debug, d.debug),
    cacheTtlDays: clamp(Math.round(num(raw.cacheTtlDays, d.cacheTtlDays)), 1, 90),
  };
}

/** Human-readable problems that should block saving. */
export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  try {
    const u = new URL(s.laya.baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    errors.push('Laya server URL must start with http:// or https://');
  }
  if (s.provider === 'jev' && !s.jev.apiKey) errors.push('An OpenRouter API key is required to use Jev');
  return errors;
}

export async function loadSettings(kv: KV): Promise<Settings> {
  const raw = await kv.get(KEY);
  return mergeSettings(raw[KEY]);
}

export async function saveSettings(kv: KV, s: Settings): Promise<Settings> {
  const merged = mergeSettings(s);
  await kv.set({ [KEY]: merged });
  return merged;
}

export const SETTINGS_KEY = KEY;
