import { CATEGORY_NAMES } from '../../shared/labels';
import { send, type ContentRequest, type ExcludeResponse, type PageStats } from '../../shared/messages';
import { hostOf, isSiteDisabled } from '../../shared/hostname';
import type { Category, ProviderStatus, Settings } from '../../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

/** The exclude list with a Remove button per site. */
function renderExcluded(sites: string[], currentHost: string, onRemove: (site: string) => void): void {
  $('excluded-count').textContent = String(sites.length);
  $('excluded-empty').hidden = sites.length > 0;
  $('excluded-list').replaceChildren(
    ...sites.map((site) => {
      const li = document.createElement('li');
      const isCurrent = !!currentHost && isSiteDisabled(currentHost, [site]);
      li.classList.toggle('current', isCurrent);
      const name = document.createElement('span');
      name.textContent = isCurrent ? `${site} (this site)` : site;
      name.title = site;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${site} from the exclude list`);
      remove.addEventListener('click', () => onRemove(site));
      li.append(name, remove);
      return li;
    }),
  );
}

async function main(): Promise<void> {
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? hostOf(tab.url) : '';
  const tabId = tab?.id;
  const { status, settings } = await send<{ status: ProviderStatus; settings: Settings }>({ type: 'status' });
  renderModel(settings, status);

  let excluded = settings.disabledSites;
  const reloadIfAffected = async (site: string) => {
    if (tabId !== undefined && host && isSiteDisabled(host, [site])) {
      await chrome.tabs.reload(tabId);
      window.close();
      return true;
    }
    return false;
  };
  const update = async (msg: { type: 'excludeSite' | 'includeSite'; site: string }) => {
    excluded = (await send<ExcludeResponse>(msg)).excluded;
    if (!(await reloadIfAffected(msg.site))) renderExcluded(excluded, host, remove);
  };
  const remove = (site: string) => void update({ type: 'includeSite', site });
  renderExcluded(excluded, host, remove);

  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('add-input');
    if (!input.value.trim()) return;
    void update({ type: 'excludeSite', site: input.value });
    input.value = '';
  });

  if (tabId === undefined || !host) {
    $('site-controls').hidden = true;
    $('summary').hidden = true;
    $('unavailable').hidden = false;
    $<HTMLDetailsElement>('excluded').open = true;
    return;
  }
  $('host').textContent = host;

  // An excluded site may be covered by a parent entry (news.example.com by example.com).
  const coveringEntry = excluded.find((site) => isSiteDisabled(host, [site]));
  const siteButton = $<HTMLButtonElement>('site-button');
  if (coveringEntry) {
    $('excluded-note').hidden = false;
    $('excluded-note').textContent =
      coveringEntry === host ? 'Blocker is off on this site.' : `Blocker is off here because ${coveringEntry} is excluded.`;
    siteButton.textContent = 'Remove from exclude list';
    siteButton.addEventListener('click', () => remove(coveringEntry));
    $('summary').hidden = true;
    return;
  }
  siteButton.textContent = 'Disable on this site';
  siteButton.title = `Add ${host} to the exclude list`;
  siteButton.addEventListener('click', () => void update({ type: 'excludeSite', site: host }));

  const stats = await toTab<PageStats>(tabId, { type: 'pageStats' });
  if (stats) {
    renderStats(stats);
    if (stats.modelStatus) renderModel(settings, stats.modelStatus);
  }

  const { count } = await send<{ count: number }>({ type: 'networkCount', tabId });
  $('network').textContent = settings.networkBlocking
    ? `${plural(count, 'ad request')} blocked by network rules`
    : 'Network blocking is off';

  let showing = false;
  $('show-hidden').addEventListener('click', async () => {
    showing = !showing;
    await toTab(tabId, { type: 'showHidden', on: showing });
    $('show-hidden').textContent = showing ? 'Hide again' : 'Show hidden';
  });
}

void main();
