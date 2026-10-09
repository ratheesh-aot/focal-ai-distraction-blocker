import { CATEGORY_NAMES } from '../../shared/labels';
import { send, type ContentRequest, type PageStats } from '../../shared/messages';
import { hostOf, isSiteDisabled } from '../../shared/hostname';
import type { Category, ProviderStatus, Settings } from '../../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_TEXT: Record<ProviderStatus['state'], string> = {
  online: 'online',
  offline: 'offline — hiding only obvious distractions',
  auth: 'rejected the API key',
  ratelimited: 'rate limited — paused',
  unknown: 'not used yet',
};

function toTab<T>(tabId: number, msg: ContentRequest): Promise<T | null> {
  return chrome.tabs.sendMessage(tabId, msg).then(
    (r) => r as T,
    () => null,
  );
}

function renderModel(settings: Settings, status: ProviderStatus): void {
  const name = settings.provider === 'jev' ? 'Jev' : 'Laya';
  $('model').querySelector('.dot')!.className = `dot ${status.state}`;
  const latency = status.state === 'online' && status.lastLatencyMs ? ` · ${(status.lastLatencyMs / 1000).toFixed(1)} s last call` : '';
  $('model-text').textContent = `${name} ${STATUS_TEXT[status.state]}${latency}`;
  $('model').title = status.message ?? '';
}

function renderStats(stats: PageStats): void {
  $('hidden-count').textContent = String(stats.hidden);
  $('categories').replaceChildren(
    ...Object.entries(stats.byCategory).map(([cat, n]) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = CATEGORY_NAMES[cat as Category];
      const count = document.createElement('strong');
      count.textContent = String(n);
      li.append(name, count);
      return li;
    }),
  );
  const parts = Object.entries(stats.bySource).map(([src, n]) => `${n} by ${src}`);
  $('sources').textContent = parts.length ? `${parts.join(', ')} · ${stats.modelCalls} model call${stats.modelCalls === 1 ? '' : 's'}` : '';
}

async function main(): Promise<void> {
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? hostOf(tab.url) : '';
  const { status, settings } = await send<{ status: ProviderStatus; settings: Settings }>({ type: 'status' });
  renderModel(settings, status);

  if (!tab?.id || !host) {
    $('summary').hidden = true;
    $('unavailable').hidden = false;
    $<HTMLInputElement>('site-toggle').disabled = true;
    for (const b of document.querySelectorAll('button')) b.disabled = true;
    return;
  }
  const tabId = tab.id;
  $('host').textContent = host;

  const toggle = $<HTMLInputElement>('site-toggle');
  toggle.checked = !isSiteDisabled(host, settings.disabledSites);
  toggle.addEventListener('change', async () => {
    await send({ type: 'toggleSite', host, enabled: toggle.checked });
    await chrome.tabs.reload(tabId);
    window.close();
  });

  const stats = await toTab<PageStats>(tabId, { type: 'pageStats' });
  if (stats) {
    renderStats(stats);
    if (stats.modelStatus) renderModel(settings, stats.modelStatus);
  }

  const { count } = await send<{ count: number }>({ type: 'networkCount', tabId });
  $('network').textContent = settings.networkBlocking ? `${count} ad request${count === 1 ? '' : 's'} blocked by network rules` : 'Network blocking is off';

  let showing = false;
  $('show-hidden').addEventListener('click', async () => {
    showing = !showing;
    await toTab(tabId, { type: 'showHidden', on: showing });
    $('show-hidden').textContent = showing ? 'Hide again' : 'Show hidden';
  });

  $('undo').addEventListener('click', async () => {
    await toTab(tabId, { type: 'undoAll' });
    await send({ type: 'toggleSite', host, enabled: false });
    await chrome.tabs.reload(tabId);
    window.close();
  });
}

void main();
