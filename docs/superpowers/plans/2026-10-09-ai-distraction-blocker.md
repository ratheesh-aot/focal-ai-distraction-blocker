# AI Distraction Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MV3 Chrome extension described in the spec: network ad blocking + DOM heuristics + Laya/Jev model arbitration for borderline elements, with options page and popup.

**Architecture:** Content script (IIFE, top frame) finds and scores candidates, hides confident ones, sends borderline summaries to the service worker. The service worker batches them across a 300 ms window, calls the selected `DecisionProvider`, caches verdicts per host in `chrome.storage.local`, and returns verdicts. Pure logic lives in small modules with injected dependencies (`fetch`, storage, `measure`) so it is unit-tested in Vitest/jsdom.

**Tech Stack:** TypeScript, Vite 8 (two builds: ES-module pages/worker + IIFE content script), Vitest 5 + jsdom, Chrome MV3 APIs (`storage`, `declarativeNetRequest`, `tabs`, `scripting` not needed), tsx for the live-model script.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-distraction-blocker-design.md`

## Global Constraints

- Manifest V3; content script is a single classic (IIFE) file; service worker is `"type": "module"`.
- Exactly 10 `choice` labels: `ad, cookie_consent, signup_modal, sticky_video, chat_widget, social_bar, paywall_overlay, recommendation_widget, main_content, site_navigation`.
- Laya default base URL `http://localhost:8002`; endpoint `/v1/predict/batch` (chunks ≤ 64), 404 → sequential `/v1/predict`; **no auth header in v1**; timeout 15 s.
- Jev: `POST https://openrouter.ai/api/alpha/decisions`, `Authorization: Bearer <key>`, default model `~typesafe/jev-latest`, concurrency 4, timeout 8 s.
- Heuristic bands: ≥ 0.85 hide now, ≤ 0.15 ignore, else model. Default threshold 0.55.
- ≤ 12 model items per scan, ≤ 5 model batches per page load, ≤ 300 candidates per scan, min size 50×20 px.
- Never hide `html`, `body`, `main`, `article`, `[role=main]`, or an element holding > 50 % of visible page text. Never hide because of an error. Never click accept-type cookie buttons.
- Cache TTL default 7 days, max 5,000 entries.
- Backoff: 3 consecutive failures → 60 s; 402/429 → 5 min; 401/403 → stop until settings change.

## Review Focus

1. Article page whose `<article>` lives inside a fixed-position wrapper → must not be hidden (text-share guard). Test in Task 3.
2. Cookie banner with both "Accept all" and "Reject all" whose accept button also contains "all" → only reject is clicked. Test in Task 7.
3. Laya server off (fetch rejects) → classify resolves with empty verdicts, status `offline`, nothing hidden. Test in Task 6.
4. Same element signature arriving from two tabs in one window → one model item, both callers get the verdict. Test in Task 6.
5. Corrupted / old-shape settings in storage → defaults merged, no crash. Test in Task 5.

## File Structure

```
public/manifest.json
rules/ad-domains.json            (generated)
scripts/gen-rules.mjs            src/shared/adDomains.json → rules/ad-domains.json
scripts/live-model-check.ts
src/shared/types.ts labels.ts messages.ts adDomains.json hostname.ts
src/content/measure.ts candidates.ts summarize.ts heuristics.ts hide.ts cookies.ts main.ts
src/providers/provider.ts laya.ts jev.ts errors.ts
src/background/settings.ts cache.ts queue.ts status.ts netrules.ts index.ts
src/ui/options/index.html options.ts options.css
src/ui/popup/index.html popup.ts popup.css
src/ui/shared.css
test/*.test.ts test/fixtures/*.html
vite.config.ts vite.content.config.ts vitest.config.ts tsconfig.json package.json
```

## Shared interfaces (used by every task)

```ts
// src/shared/types.ts
export type Label = 'ad'|'cookie_consent'|'signup_modal'|'sticky_video'|'chat_widget'|'social_bar'|'paywall_overlay'|'recommendation_widget'|'main_content'|'site_navigation';
export type Category = Exclude<Label, 'main_content'|'site_navigation'>;
export interface ElementSummary { tag: string; role?: string; classes?: string; text?: string; buttons?: string[]; link_domains?: string[]; iframe_src?: string; position: string; z_index?: number; locks_scroll?: boolean; }
export interface Features { fixed: boolean; sticky: boolean; coverage: number; zIndex: number; locksScroll: boolean; adHost: boolean; area: number; }
export interface CandidateInfo { summary: ElementSummary; features: Features; }
export type VerdictSource = 'heuristic'|'model'|'cache';
export interface Verdict { label: Label; confidence: number; }
export interface Settings { provider: 'laya'|'jev'; laya: { baseUrl: string; model: 'english'|'typed-decisions'|'multilingual' }; jev: { apiKey: string; model: string }; categories: Record<Category, boolean>; cookieMode: 'reject'|'hide'; threshold: number; networkBlocking: boolean; disabledSites: string[]; debug: boolean; cacheTtlDays: number; }
export type ProviderState = 'online'|'offline'|'auth'|'ratelimited'|'unknown';
export interface ProviderStatus { state: ProviderState; message?: string; lastLatencyMs?: number; calls: number; }
```

---

### Task 1: Scaffold, shared types, labels, ad-domain rules, build

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.content.config.ts`, `vitest.config.ts`, `public/manifest.json`, `src/shared/types.ts`, `src/shared/labels.ts`, `src/shared/adDomains.json`, `src/shared/hostname.ts`, `scripts/gen-rules.mjs`, `.gitignore`. Test: `test/labels.test.ts`, `test/hostname.test.ts`.

**Interfaces — Produces:**
- `LABELS: readonly Label[]`, `CATEGORIES: readonly Category[]`, `CATEGORY_NAMES: Record<Category,string>`, `isCategory(l: Label): l is Category`
- `buildQuestions(): { kind: { type:'choice'; instructions:string; criteria: Record<Label,string> } }`
- `AD_DOMAINS: string[]` (from adDomains.json); `isAdHost(host: string): boolean` (suffix match)
- `hostOf(url: string): string` (lowercase, strips leading `www.`, '' on invalid)

- [ ] Step 1: tests — `buildQuestions().kind.criteria` has exactly the 10 labels; `CATEGORIES` has 8 and excludes `main_content`/`site_navigation`; `isAdHost('securepubads.g.doubleclick.net')` true, `isAdHost('example.com')` false, `isAdHost('notdoubleclick.net')` false; `hostOf('https://www.Example.com/x')==='example.com'`, `hostOf('nope')===''`.
- [ ] Step 2: run `npx vitest run` → FAIL (modules missing).
- [ ] Step 3: implement modules; `gen-rules.mjs` writes one DNR rule per domain `{id, priority:1, action:{type:'block'}, condition:{requestDomains:[d], resourceTypes:[sub_frame,script,image,xmlhttprequest,media,other], excludedResourceTypes omitted}}`; manifest declares ruleset `ads` enabled, permissions `storage, declarativeNetRequest, declarativeNetRequestFeedback, tabs`, host_permissions `<all_urls>`, content script `content.js` at `document_start`, top frame only.
- [ ] Step 4: `npx vitest run` PASS; `npm run build` produces `dist/manifest.json, background.js, content.js, options.html, popup.html, rules/ad-domains.json`.
- [ ] Step 5: commit `feat: scaffold extension build, labels and ad-domain rules`.

### Task 2: Heuristics

**Files:** Create `src/content/heuristics.ts`; Test `test/heuristics.test.ts`.

**Interfaces — Produces:** `scoreCandidate(info: CandidateInfo): { score: number; guess: Category | null }`; `HIDE_NOW = 0.85`, `IGNORE_BELOW = 0.15`; `band(score): 'hide'|'ask'|'ignore'`.

Signals (weights table, score = min(1, sum)); guess = category of strongest signal:
- `adHost` → ad +0.9
- fixed/sticky & coverage ≥ 0.3 & text matches cookie vocab (`cookie|consent|gdpr|privacy`) & buttons match accept/reject → cookie_consent +0.9; cookie vocab alone with fixed → +0.5
- class matches chat vendors (`intercom|drift|zendesk|crisp|tawk|hubspot-messages|livechat|tidio`) → chat_widget +0.9
- class/iframe matches `outbrain|taboola|revcontent|mgid` → recommendation_widget +0.9
- fixed & locksScroll & text matches `subscribe|newsletter|sign up|inbox` → signup_modal +0.6
- class matches `paywall|regwall|piano` → paywall_overlay +0.5
- `video` tag or class `sticky-video|floating-player|jw-flag-floating` and fixed → sticky_video +0.6
- class `share|social` & text short → social_bar +0.35
- generic keyword (`\bad(s|vert|unit|slot)?\b|sponsor|banner|promo|popup|modal|overlay`) → ad/signup +0.3
- fixed/sticky → +0.1; zIndex ≥ 1000 → +0.05

- [ ] Steps: tests for each fixture (doubleclick iframe → ≥0.85 ad; consent banner → ≥0.85 cookie_consent; intercom → ≥0.85 chat; plain article paragraph → ≤0.15 null; `class="ad-slot"` static → band ask), run fail, implement, pass, commit `feat: heuristic scoring`.

### Task 3: Measure, summarize, candidates

**Files:** Create `src/content/measure.ts`, `summarize.ts`, `candidates.ts`; Test `test/candidates.test.ts`, `test/summarize.test.ts`, fixtures `test/fixtures/news.html`.

**Interfaces — Produces:**
- `interface Measured { rect: {width:number;height:number;top:number;left:number}; position: string; zIndex: number; display: string; visibility: string; }`, `type Measure = (el: Element) => Measured`, `domMeasure: Measure`, `viewport(): {width:number;height:number}`
- `summarize(el: Element, m: Measured, vp, locksScroll: boolean): CandidateInfo`
- `signatureOf(s: ElementSummary): string`
- `findCandidates(doc: Document, opts: { measure?: Measure; viewport?: {width,height}; seen?: WeakSet<Element>; roots?: Element[] }): Element[]`
- `pageLocksScroll(doc): boolean`, `textShare(el, doc): number`

Tests (fake measure reads `data-rect="w,h,top,left"` and `data-pos`): consent banner + ad iframe + intercom found; `<article>` and the fixed wrapper holding > 50 % text excluded (Review Focus 1); 10×10 element excluded; hidden element excluded; `seen` elements skipped; signature stable across digit-only class changes (`css-1a2b3c` vs `css-9z8y7x`); text truncated to 300, ≤ 6 buttons.

- [ ] Steps: tests → fail → implement → pass → commit `feat: candidate discovery and element summaries`.

### Task 4: Providers

**Files:** Create `src/providers/errors.ts`, `provider.ts`, `laya.ts`, `jev.ts`; Test `test/providers.test.ts`.

**Interfaces — Produces:**
- `class ProviderError extends Error { kind: 'network'|'timeout'|'auth'|'ratelimit'|'bad_response'|'http'; status?: number }`
- `interface DecisionProvider { decide(states: ElementSummary[]): Promise<(Verdict|null)[]>; health(): Promise<{ ok: boolean; detail: string; latencyMs: number }>; }`
- `createLayaProvider(cfg: Settings['laya'], fetchImpl = fetch, timeoutMs = 15000)`
- `createJevProvider(cfg: Settings['jev'], fetchImpl = fetch, timeoutMs = 8000)`
- `createProvider(settings: Settings, fetchImpl?): DecisionProvider`
- `parseChoice(ans: unknown): Verdict | null`

Tests with mocked fetch: Laya posts `{states, questions, model}` to `/v1/predict/batch`, no `authorization` header; 70 states → 2 calls (64 + 6) and order preserved; 404 → falls back to N `/v1/predict` calls; trailing slash in baseUrl handled; 401 → ProviderError auth; fetch reject → network; Jev sends Bearer + `model` + single `state`, max 4 in flight for 10 states, 429 → ratelimit, 402 → ratelimit; malformed answer → null entry.

- [ ] Steps: tests → fail → implement → pass → commit `feat: Laya and Jev decision providers`.

### Task 5: Settings and cache

**Files:** Create `src/background/settings.ts`, `cache.ts`, `src/shared/storage.ts`; Test `test/settings.test.ts`, `test/cache.test.ts`.

**Interfaces — Produces:**
- `interface KV { get(keys: string[]|string|null): Promise<Record<string,unknown>>; set(items: Record<string,unknown>): Promise<void>; remove(keys: string|string[]): Promise<void> }`, `chromeKV: KV`
- `DEFAULT_SETTINGS: Settings`, `mergeSettings(raw: unknown): Settings`, `validateSettings(s): string[]` (errors), `loadSettings(kv)`, `saveSettings(kv, s)`
- `interface CacheEntry { label: Label; confidence: number; at: number; selector?: string }`
- `class VerdictCache { constructor(kv: KV, opts: { ttlDays: number; maxEntries?: number; now?: () => number }); getHost(host): Promise<Record<string, CacheEntry>>; put(host, entries: Record<string, CacheEntry>): Promise<void>; clear(): Promise<void>; count(): Promise<number> }`

Tests: merge of `null`, `{provider:'x'}`, partial categories → defaults (Review Focus 5); validate rejects non-http(s) Laya URL and Jev without key when provider=jev; threshold clamped 0.3–0.95; cache TTL expiry; eviction of least-recently-used hosts when > maxEntries; clear.

- [ ] Steps: tests → fail → implement → pass → commit `feat: settings and verdict cache`.

### Task 6: Status, queue, network rules, background wiring

**Files:** Create `src/background/status.ts`, `queue.ts`, `netrules.ts`, `index.ts`, `src/shared/messages.ts`; Test `test/queue.test.ts`, `test/status.test.ts`.

**Interfaces — Produces:**
- `class StatusTracker { get(): ProviderStatus; canCall(now): boolean; success(latency); failure(err: ProviderError, now); reset() }`
- `class DecisionQueue { constructor(deps: { getProvider: () => DecisionProvider; status: StatusTracker; windowMs?: number; now?: () => number }); classify(items: { signature: string; summary: ElementSummary }[]): Promise<Record<string, Verdict>> }`
- messages (`src/shared/messages.ts`):
  - `{type:'init', url}` → `{ enabled: boolean; settings: Settings; cached: Record<string, CacheEntry> }`
  - `{type:'classify', url, items}` → `{ verdicts: Record<string, Verdict>; status: ProviderStatus }`
  - `{type:'remember', url, entries: Record<string, CacheEntry>}` → `{ok:true}`
  - `{type:'status'}` → `{ status: ProviderStatus; settings: Settings }`
  - `{type:'testConnection', settings}` → `{ ok, detail, latencyMs }`
  - `{type:'clearCache'}`, `{type:'cacheCount'}`, `{type:'toggleSite', host, enabled}`, `{type:'networkCount', tabId}`
  - content-script side (popup → tab): `{type:'pageStats'}` → `PageStats`, `{type:'showHidden', on: boolean}`, `{type:'undoAll'}`
- `applyNetRules(settings): Promise<void>` (enable/disable ruleset; dynamic `allowAllRequests` rules for disabled sites)

Tests: two classify calls within window → one `decide` call, dedup by signature (Review Focus 4); provider rejects → `{}` and status offline (Review Focus 3); 3 failures → `canCall` false for 60 s; auth error → `canCall` false until `reset()`; ratelimit → 5 min.

- [ ] Steps: tests → fail → implement → pass → commit `feat: background queue, status and network rules`.

### Task 7: Hide, cookies, content orchestration

**Files:** Create `src/content/hide.ts`, `cookies.ts`, `main.ts`; Test `test/hide.test.ts`, `test/cookies.test.ts`.

**Interfaces — Produces:**
- `class Hider { constructor(doc, opts:{debug:boolean}); hide(el, rec: { label: Label; confidence: number; source: VerdictSource }): void; unlockScroll(): void; injectSelectors(selectors: string[]): void; showHidden(on: boolean): void; undoAll(): void; stats(): PageStats }`
- `PageStats = { host: string; enabled: boolean; byCategory: Partial<Record<Category, number>>; bySource: Partial<Record<VerdictSource, number>>; modelCalls: number; modelOffline: boolean }`
- `findRejectButton(banner: Element): HTMLElement | null`; `REJECT_RE`, `ACCEPT_RE`
- `stableSelector(el): string | null` (id without digits runs ≥ 3, or tag + ≥1 non-hashy class; must match exactly one element)

Tests: hide sets `data-adb-hidden` and stylesheet; debug mode sets `data-adb-debug` instead; undoAll restores; `findRejectButton` picks "Reject all" not "Accept all" (Review Focus 2), "Only necessary", German "Alle ablehnen"; returns null when only accept present; `stableSelector` rejects `#ad-123456`.

`main.ts` flow: at `document_start` send `init`; if disabled stop; inject cached selectors whose label is enabled & confidence ≥ threshold; on DOMContentLoaded run `scan()`; MutationObserver debounced 500 ms → `scan(addedRoots)`; `scan` → candidates → summarize → cache hit / band → hide-now / collect ask (sort desc score, slice 12, ≤ 5 batches) → `classify` → apply → `remember` entries with selectors. Cookie: on cookie_consent, if cookieMode reject → click reject once (WeakSet) then hide + unlockScroll. Message listener for popup.

- [ ] Steps: tests → fail → implement → pass; build; commit `feat: content script hiding, cookie rejection and orchestration`.

### Task 8: Options page and popup

**Files:** Create `src/ui/shared.css`, `src/ui/options/{index.html,options.ts,options.css}`, `src/ui/popup/{index.html,popup.ts,popup.css}`.

Options: provider radio, Laya URL + checkpoint select, Jev key + model, Test connection (shows detail + latency), 8 category toggles, cookie mode, threshold slider (0.30–0.95 step 0.05), network blocking toggle, disabled sites textarea (one per line), debug toggle, cache TTL + count + Clear; Save validates via `validateSettings` and shows inline errors. Popup: host, site toggle (reloads tab), counts by category and source, network blocked count, model status line, Show hidden / Undo all buttons, link to options.

- [ ] Steps: implement; `npm run build`; `npx tsc --noEmit`; commit `feat: options page and popup`.

### Task 9: Live model check, docs, end-to-end verification

**Files:** Create `scripts/live-model-check.ts`, `test/fixtures/summaries.json`; Modify `README.md` (install/build/usage).

- [ ] Script posts fixture summaries (with expected labels) through `createLayaProvider`, prints accuracy + latency; run against `http://localhost:8002`.
- [ ] Load `dist/` in Chromium via Playwright (`--load-extension`) on a local fixture page served over http; confirm cookie banner hidden, reject clicked, article visible.
- [ ] README: build, load unpacked, configure, test; commit `docs: usage and live model check`.
