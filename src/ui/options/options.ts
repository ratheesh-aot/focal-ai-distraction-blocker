import { CATEGORIES, CATEGORY_NAMES } from '../../shared/labels';
import { send, type ExcludeResponse, type SaveResponse } from '../../shared/messages';
import type { ProviderHealth } from '../../providers/provider';
import type { Category, Settings } from '../../shared/types';

const form = document.getElementById('form') as HTMLFormElement;
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => form.elements.namedItem(name) as unknown as T;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let current: Settings;

function renderCategories(): void {
  $('categories').replaceChildren(
    ...CATEGORIES.map((c) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.name = `cat:${c}`;
      label.append(box, CATEGORY_NAMES[c]);
      return label;
    }),
  );
}

function showKeyHint(): void {
  $('jev-key-hint').classList.toggle('has-key', field('jevKey').value.trim() !== '');
}

function showProviderFields(): void {
  const provider = (form.querySelector('input[name="provider"]:checked') as HTMLInputElement | null)?.value;
  $('laya-fields').hidden = provider !== 'laya';
  $('jev-fields').hidden = provider !== 'jev';
}

function fill(s: Settings): void {
  (form.querySelector(`input[name="provider"][value="${s.provider}"]`) as HTMLInputElement).checked = true;
  field('layaUrl').value = s.laya.baseUrl;
  field<HTMLSelectElement>('layaModel').value = s.laya.model;
  field('jevKey').value = s.jev.apiKey;
  field('jevModel').value = s.jev.model;
  for (const c of CATEGORIES) field(`cat:${c}`).checked = s.categories[c];
  field<HTMLSelectElement>('cookieMode').value = s.cookieMode;
  field('threshold').value = String(s.threshold);
  $('threshold-value').textContent = s.threshold.toFixed(2);
  field('networkBlocking').checked = s.networkBlocking;
  field('debug').checked = s.debug;
  field('cacheTtlDays').value = String(s.cacheTtlDays);
  showProviderFields();
  showKeyHint();
}

function read(): Settings {
  const provider = (form.querySelector('input[name="provider"]:checked') as HTMLInputElement).value as Settings['provider'];
  return {
    provider,
    laya: { baseUrl: field('layaUrl').value.trim(), model: field<HTMLSelectElement>('layaModel').value as Settings['laya']['model'] },
    jev: { apiKey: field('jevKey').value.trim(), model: field('jevModel').value.trim() },
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, field(`cat:${c}`).checked])) as Record<Category, boolean>,
    cookieMode: field<HTMLSelectElement>('cookieMode').value as Settings['cookieMode'],
    threshold: Number(field('threshold').value),
    networkBlocking: field('networkBlocking').checked,
    debug: field('debug').checked,
    disabledSites: current.disabledSites,
    cacheTtlDays: Number(field('cacheTtlDays').value),
  };
}

function renderExcluded(): void {
  const sites = current.disabledSites;
  $('excluded-empty').hidden = sites.length > 0;
  $('excluded-list').replaceChildren(
    ...sites.map((site) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = site;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${site} from the exclude list`);
      remove.addEventListener('click', () => void changeExcluded({ type: 'includeSite', site }));
      li.append(name, remove);
      return li;
    }),
  );
}

async function changeExcluded(msg: { type: 'excludeSite' | 'includeSite'; site: string }): Promise<void> {
  const { excluded } = await send<ExcludeResponse>(msg);
  current = { ...current, disabledSites: excluded };
  renderExcluded();
}

async function refreshCacheCount(): Promise<void> {
  const { count } = await send<{ count: number }>({ type: 'cacheCount' });
  $('cache-count').textContent = `${count} remembered element${count === 1 ? '' : 's'}`;
}

form.addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).name === 'provider') showProviderFields();
  $('saved').textContent = '';
});
field('jevKey').addEventListener('input', showKeyHint);
field('threshold').addEventListener('input', () => {
  $('threshold-value').textContent = Number(field('threshold').value).toFixed(2);
});

$('test').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('test');
  const out = $('test-result');
  button.disabled = true;
  out.className = 'muted';
  out.textContent = 'Testing…';
  const h = await send<ProviderHealth>({ type: 'testConnection', settings: read() });
  out.className = h.ok ? 'success' : 'error';
  out.textContent = h.ok ? `${h.detail} · ${h.latencyMs} ms` : h.detail;
  button.disabled = false;
});

const addExcluded = () => {
  const input = $<HTMLInputElement>('exclude-input');
  if (!input.value.trim()) return;
  void changeExcluded({ type: 'excludeSite', site: input.value });
  input.value = '';
};
$('exclude-add').addEventListener('click', addExcluded);
$('exclude-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addExcluded();
  }
});

$('clear-cache').addEventListener('click', async () => {
  await send({ type: 'clearCache' });
  await refreshCacheCount();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await send<SaveResponse>({ type: 'saveSettings', settings: read() });
  $('errors').replaceChildren(
    ...res.errors.map((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      return li;
    }),
  );
  if (res.ok) {
    current = res.settings;
    fill(current);
    renderExcluded();
    $('saved').textContent = 'Saved';
  }
});

renderCategories();
current = await send<Settings>({ type: 'getSettings' });
fill(current);
renderExcluded();
void refreshCacheCount();
