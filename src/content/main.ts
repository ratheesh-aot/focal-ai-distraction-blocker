import { send, type ClassifyResponse, type ContentRequest, type InitResponse, type PageStats } from '../shared/messages';
import { hostOf } from '../shared/hostname';
import type { CacheEntry, CandidateInfo, ProviderStatus, Settings, Verdict, VerdictSource } from '../shared/types';
import { findCandidates } from './candidates';
import { findRejectButton } from './cookies';
import { band, scoreCandidate } from './heuristics';
import { Hider, stableSelector } from './hide';
import { domMeasure, pageLocksScroll, viewport } from './measure';
import { shouldHide } from './policy';
import { signatureOf, summarize } from './summarize';

const MAX_MODEL_ITEMS_PER_SCAN = 12;
const MAX_MODEL_BATCHES_PER_PAGE = 5;
const MUTATION_DEBOUNCE_MS = 500;

interface Pending {
  el: Element;
  sig: string;
  info: CandidateInfo;
  score: number;
}

const url = location.href;
const host = hostOf(url);
let enabled = false;
let hider: Hider | null = null;
let modelCalls = 0;
let modelStatus: ProviderStatus | undefined;

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  if (msg.type === 'pageStats') {
    const s = hider?.stats() ?? { hidden: 0, byCategory: {}, bySource: {} };
    sendResponse({ host, enabled, ...s, modelCalls, modelStatus } satisfies PageStats);
  } else if (msg.type === 'showHidden') {
    hider?.showHidden(msg.on);
    sendResponse({ ok: true });
  } else if (msg.type === 'undoAll') {
    hider?.undoAll();
    sendResponse({ ok: true });
  }
  return false;
});

async function start(): Promise<void> {
  const init = await send<InitResponse>({ type: 'init', url }).catch(() => null);
  if (!init?.enabled) return;
  enabled = true;
  const settings: Settings = init.settings;
  const cached: Record<string, CacheEntry> = init.cached;
  const h = new Hider(document, { debug: settings.debug });
  hider = h;

  h.injectSelectors(
    Object.values(cached)
      .filter((e) => e.selector && shouldHide(e, settings))
      .map((e) => e.selector!),
  );

  const seen = new WeakSet<Element>();
  const clickedBanners = new WeakSet<Element>();
  let modelBatches = 0;

  function apply(el: Element, info: CandidateInfo, v: Verdict, source: VerdictSource): boolean {
    if (!shouldHide(v, settings)) return false;
    if (v.label === 'cookie_consent' && settings.cookieMode === 'reject' && !settings.debug && !clickedBanners.has(el)) {
      clickedBanners.add(el);
      findRejectButton(el)?.click();
    }
    h.hide(el, { label: v.label, confidence: v.confidence, source });
    const f = info.features;
    if (f.locksScroll || ((f.fixed || f.sticky) && f.coverage >= 0.3)) h.unlockScroll();
    return true;
  }

  const entry = (v: Verdict, el: Element): CacheEntry => {
    const selector = stableSelector(el);
    return { label: v.label, confidence: v.confidence, at: Date.now(), ...(selector ? { selector } : {}) };
  };

  function report(): void {
    void send({ type: 'hiddenCount', count: h.stats().hidden }).catch(() => {});
  }

  /** Cache hits and confident heuristics are applied now; the rest is returned for the model. */
  function triage(roots?: Element[]): Pending[] {
    const vp = viewport();
    const locked = pageLocksScroll(document);
    const remember: Record<string, CacheEntry> = {};
    const ask: Pending[] = [];

    for (const el of findCandidates(document, { seen, roots, viewport: vp })) {
      seen.add(el);
      if (h.isHidden(el)) continue;
      const info = summarize(el, domMeasure(el), vp, locked);
      const sig = signatureOf(info.summary);
      const hit = cached[sig];
      if (hit) {
        if (apply(el, info, hit, 'cache') && !hit.selector) remember[sig] = entry(hit, el);
        continue;
      }
      const { score, guess } = scoreCandidate(info);
      const b = band(score);
      if (b === 'hide' && guess) {
        const v = { label: guess, confidence: score };
        if (apply(el, info, v, 'heuristic')) remember[sig] = cached[sig] = entry(v, el);
      } else if (b === 'ask') {
        ask.push({ el, sig, info, score });
      }
    }

    if (Object.keys(remember).length) void send({ type: 'remember', url, entries: remember }).catch(() => {});
    return ask;
  }

  /** Sends the highest-scoring borderline elements to the model and applies the verdicts. */
  async function askModel(ask: Pending[]): Promise<void> {
    // Elements that miss this batch become eligible again on a later scan.
    ask.sort((a, b) => b.score - a.score);
    const batch = ask.slice(0, MAX_MODEL_ITEMS_PER_SCAN);
    for (const p of ask.slice(MAX_MODEL_ITEMS_PER_SCAN)) seen.delete(p.el);
    if (modelBatches >= MAX_MODEL_BATCHES_PER_PAGE) {
      for (const p of batch) seen.delete(p.el);
      return;
    }
    modelBatches++;

    const res = await send<ClassifyResponse>({
      type: 'classify',
      url,
      items: batch.map((p) => ({ signature: p.sig, summary: p.info.summary })),
    }).catch(() => null);
    modelCalls++;
    modelStatus = res?.status;

    const learned: Record<string, CacheEntry> = {};
    for (const p of batch) {
      const v = res?.verdicts[p.sig];
      if (!v) {
        seen.delete(p.el);
        continue;
      }
      cached[p.sig] = { ...v, at: Date.now() };
      if (p.el.isConnected && apply(p.el, p.info, v, 'model')) learned[p.sig] = cached[p.sig] = entry(v, p.el);
    }
    if (Object.keys(learned).length) void send({ type: 'remember', url, entries: learned }).catch(() => {});
  }

  /**
   * Local triage runs immediately on every scan; model calls run alongside it so a slow
   * model never delays hiding an obvious distraction. `seen` prevents duplicate asks.
   */
  function queueScan(roots?: Element[]): void {
    try {
      const ask = triage(roots);
      report();
      if (ask.length) void askModel(ask).then(report, (e) => console.debug('[adb] model step failed', e));
    } catch (e) {
      console.debug('[adb] scan failed', e);
    }
  }

  let pendingRoots = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => n instanceof Element && pendingRoots.add(n));
      else if (r.target instanceof Element && !r.target.hasAttribute('data-adb-hidden')) pendingRoots.add(r.target);
    }
    if (pendingRoots.size === 0 || timer) return;
    timer = setTimeout(() => {
      timer = null;
      const roots = [...pendingRoots].filter((el) => el.isConnected && document.body?.contains(el));
      pendingRoots = new Set();
      const outermost = roots.filter((el) => !roots.some((other) => other !== el && other.contains(el)));
      if (outermost.length) queueScan(outermost);
    }, MUTATION_DEBOUNCE_MS);
  });

  const begin = () => {
    queueScan();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
  else begin();
}

if (window.top === window) void start();
