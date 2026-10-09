import type { CacheEntry, Category, ElementSummary, ProviderStatus, Settings, Verdict, VerdictSource } from './types';

/** Messages handled by the service worker (sent with chrome.runtime.sendMessage). */
export type BackgroundRequest =
  | { type: 'init'; url: string }
  | { type: 'classify'; url: string; items: { signature: string; summary: ElementSummary }[] }
  | { type: 'remember'; url: string; entries: Record<string, CacheEntry> }
  | { type: 'hiddenCount'; count: number }
  | { type: 'status' }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; settings: Settings }
  | { type: 'testConnection'; settings: Settings }
  | { type: 'clearCache' }
  | { type: 'cacheCount' }
  | { type: 'excludeSite'; site: string }
  | { type: 'includeSite'; site: string }
  | { type: 'networkCount'; tabId: number };

export interface InitResponse {
  enabled: boolean;
  settings: Settings;
  cached: Record<string, CacheEntry>;
}

export interface ClassifyResponse {
  verdicts: Record<string, Verdict>;
  status: ProviderStatus;
}

/** Reply to excludeSite / includeSite: the exclude list after the change. */
export interface ExcludeResponse {
  excluded: string[];
}

export interface SaveResponse {
  ok: boolean;
  errors: string[];
  settings: Settings;
}

/** Messages handled by the content script (sent from the popup with chrome.tabs.sendMessage). */
export type ContentRequest = { type: 'pageStats' } | { type: 'showHidden'; on: boolean } | { type: 'undoAll' };

export interface PageStats {
  host: string;
  enabled: boolean;
  hidden: number;
  byCategory: Partial<Record<Category, number>>;
  bySource: Partial<Record<VerdictSource, number>>;
  modelCalls: number;
  modelStatus?: ProviderStatus;
}

export function send<T>(msg: BackgroundRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}
