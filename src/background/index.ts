import { createProvider, type DecisionProvider } from '../providers';
import { hostOf, isSiteDisabled } from '../shared/hostname';
import type { BackgroundRequest, ClassifyResponse, InitResponse, SaveResponse } from '../shared/messages';
import { chromeKV } from '../shared/storage';
import type { CacheEntry, Settings } from '../shared/types';
import { VerdictCache } from './cache';
import { applyNetRules, blockedCount } from './netrules';
import { DecisionQueue } from './queue';
import { loadSettings, saveSettings, SETTINGS_KEY, validateSettings } from './settings';
import { StatusTracker } from './status';

let settings: Settings | null = null;
let provider: DecisionProvider | null = null;
const status = new StatusTracker();
const queue = new DecisionQueue({ getProvider: () => provider!, status });

async function current(): Promise<Settings> {
  if (!settings) {
    settings = await loadSettings(chromeKV);
    provider = createProvider(settings);
  }
  return settings;
}

function cache(s: Settings) {
  return new VerdictCache(chromeKV, { ttlDays: s.cacheTtlDays });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
  settings = null;
  provider = null;
  status.reset();
  void current().then(applyNetRules);
});

chrome.runtime.onInstalled.addListener(() => void current().then(applyNetRules));
chrome.runtime.onStartup.addListener(() => void current().then(applyNetRules));

async function handle(msg: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const s = await current();
  switch (msg.type) {
    case 'init': {
      const host = hostOf(msg.url);
      const enabled = !!host && !isSiteDisabled(host, s.disabledSites);
      const cached = enabled ? await cache(s).getHost(host) : {};
      return { enabled, settings: s, cached } satisfies InitResponse;
    }
    case 'classify': {
      const verdicts = await queue.classify(msg.items);
      const host = hostOf(msg.url);
      const now = Date.now();
      const entries: Record<string, CacheEntry> = {};
      for (const [sig, v] of Object.entries(verdicts)) entries[sig] = { ...v, at: now };
      if (host && Object.keys(entries).length) await cache(s).put(host, entries);
      return { verdicts, status: status.get() } satisfies ClassifyResponse;
    }
    case 'remember': {
      const host = hostOf(msg.url);
      if (host) await cache(s).put(host, msg.entries);
      return { ok: true };
    }
    case 'hiddenCount': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b5bdb' });
        await chrome.action.setBadgeText({ tabId, text: msg.count ? String(msg.count) : '' });
      }
      return { ok: true };
    }
    case 'status':
      return { status: status.get(), settings: s };
    case 'getSettings':
      return s;
    case 'saveSettings': {
      const errors = validateSettings(msg.settings);
      if (errors.length) return { ok: false, errors, settings: s } satisfies SaveResponse;
      const saved = await saveSettings(chromeKV, msg.settings);
      return { ok: true, errors: [], settings: saved } satisfies SaveResponse;
    }
    case 'testConnection': {
      try {
        return await createProvider(msg.settings).health();
      } catch (e) {
        return { ok: false, detail: (e as Error).message, latencyMs: 0 };
      }
    }
    case 'clearCache':
      await cache(s).clear();
      return { ok: true };
    case 'cacheCount':
      return { count: await cache(s).count() };
    case 'toggleSite': {
      const sites = s.disabledSites.filter((x) => x !== msg.host);
      if (!msg.enabled) sites.push(msg.host);
      await saveSettings(chromeKV, { ...s, disabledSites: sites });
      return { ok: true };
    }
    case 'networkCount':
      return { count: await blockedCount(msg.tabId) };
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true;
});
