import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings, validateSettings } from '../src/background/settings';
import { memoryKV } from './memoryKV';

describe('mergeSettings', () => {
  it('returns the defaults for missing or corrupted data', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ provider: 'x', threshold: 'high', disabledSites: 'a.com' })).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults to Laya on localhost:8002 with every category on', () => {
    expect(DEFAULT_SETTINGS.provider).toBe('laya');
    expect(DEFAULT_SETTINGS.laya.baseUrl).toBe('http://localhost:8002');
    expect(DEFAULT_SETTINGS.jev.model).toBe('~typesafe/jev-latest');
    expect(Object.values(DEFAULT_SETTINGS.categories).every(Boolean)).toBe(true);
    expect(DEFAULT_SETTINGS.threshold).toBe(0.55);
    expect(DEFAULT_SETTINGS.cookieMode).toBe('reject');
  });

  it('keeps valid stored values and fills in new categories', () => {
    const s = mergeSettings({ provider: 'jev', jev: { apiKey: 'k' }, categories: { ad: false }, threshold: 0.7 });
    expect(s.provider).toBe('jev');
    expect(s.jev).toEqual({ apiKey: 'k', model: '~typesafe/jev-latest' });
    expect(s.categories.ad).toBe(false);
    expect(s.categories.chat_widget).toBe(true);
    expect(s.threshold).toBe(0.7);
  });

  it('clamps the threshold into 0.30-0.95', () => {
    expect(mergeSettings({ threshold: 0.1 }).threshold).toBe(0.3);
    expect(mergeSettings({ threshold: 2 }).threshold).toBe(0.95);
  });

  it('normalises disabled sites', () => {
    expect(mergeSettings({ disabledSites: [' WWW.Example.com ', '', 'news.site'] }).disabledSites).toEqual(['example.com', 'news.site']);
  });
});

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([]);
  });
  it('rejects a Laya URL that is not http(s)', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, laya: { ...DEFAULT_SETTINGS.laya, baseUrl: 'localhost:8002' } })).toHaveLength(1);
  });
  it('requires an OpenRouter key when Jev is selected', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, provider: 'jev' })[0]).toMatch(/OpenRouter API key/);
  });
});

describe('load/save', () => {
  it('round-trips through storage', async () => {
    const kv = memoryKV();
    await saveSettings(kv, { ...DEFAULT_SETTINGS, debug: true });
    expect((await loadSettings(kv)).debug).toBe(true);
  });
  it('loads defaults from empty storage', async () => {
    expect(await loadSettings(memoryKV())).toEqual(DEFAULT_SETTINGS);
  });
});

import { addExcluded, removeExcluded } from '../src/background/settings';

describe('exclude list', () => {
  it('adds a site from a host or a full URL, normalised', () => {
    expect(addExcluded([], 'https://www.Example.com/page?x=1')).toEqual(['example.com']);
    expect(addExcluded(['a.com'], 'dashboard.ngrok.com')).toEqual(['a.com', 'dashboard.ngrok.com']);
  });

  it('does not add duplicates or blanks', () => {
    expect(addExcluded(['example.com'], 'EXAMPLE.com')).toEqual(['example.com']);
    expect(addExcluded(['example.com'], '   ')).toEqual(['example.com']);
  });

  it('removes a site, accepting the same spellings as add', () => {
    expect(removeExcluded(['a.com', 'example.com'], 'https://www.example.com/')).toEqual(['a.com']);
    expect(removeExcluded(['a.com'], 'missing.com')).toEqual(['a.com']);
  });
});
