# AI Distraction Blocker — Design Spec

Date: 2026-10-09
Status: Draft for review

## 1. Goal

A Chrome extension for **daily browsing** that removes things distracting the user from a page's
real content: ads, cookie consent banners, signup/newsletter modals, sticky/autoplay video, chat
and social widgets, paywall overlays and recommendation walls.

Classification of ambiguous page elements is done by a **typed-decision model**, selectable in
settings:

- **Laya** (Convai, open weights) — self-hosted HTTP server, configurable base URL. No authentication in v1 (see README "Future work").
  Default `http://localhost:8002`.
- **Jev** (TypeSafe) — via OpenRouter's Decisions API, configurable OpenRouter key + model id.

### Success criteria

- On a typical news/blog site, cookie banner and signup modal are gone without user action, and
  the article is never hidden.
- Pages are never blocked waiting on the model; the extension still blocks known ads with the
  model server off.
- Repeat visits to a site issue zero model calls for previously judged elements.
- Every hide is reversible per site from the popup.

### Non-goals (v1)

- Screenshot / vision-based detection.
- Fine-tuning Laya (possible later; collected debug labels could feed it).
- Firefox / Safari support.
- Syncing settings or cache across devices.
- Bypassing paywalls (we only hide the overlay; content behind it is not fetched).

## 2. Facts that shaped the design

Measured against the user's local Laya server (Windows, `torch-cpu`, 2 workers, `english`
checkpoint) on 2026-10-09:

| Call | Result |
| --- | --- |
| `/v1/predict/batch`, 6 element summaries, one 10-label `choice` question | 6/6 labels correct, **4.9 s** total (~0.8 s/element) |
| `/v1/predict`, 1 element, same question | **2.6 s** |
| `noul` "is this distracting?" question | ~0.2 for every element incl. the article — **not discriminative, dropped** |

From the laya-api README / model card: zero-shot Laya scores 0.362 on typed decisions (below the
0.461 majority baseline), and ships over-confident. `choice` with ≥11 labels triggers a
calibration warning, so the label set is capped at 10. `LAYA_MAX_BATCH_ITEMS` defaults to 64.

From OpenRouter's Decisions API reference: `POST https://openrouter.ai/api/alpha/decisions`,
`Authorization: Bearer <key>`, body `{model, state, questions}`, **single state per request (no
batch)**, `noul` requires `criteria: {"true","false"}`, answers have the same shape as Laya's
(`choice`, `confidence`, `probabilities`), plus `usage.cost`.

Consequence: the model is the **arbiter for borderline candidates only**, called in batches, with
aggressive caching. Cheap layers (network rules, DOM heuristics) do most of the work.

## 3. Architecture

Manifest V3 extension, TypeScript, built with Vite, tested with Vitest.

```
┌─────────────────── Chrome (MV3) ────────────────────┐
│ declarativeNetRequest  ← bundled ad/tracker rules   │
│                                                     │
│ content script (per frame)     service worker       │
│  ├ candidates.ts               ├ providers/         │
│  ├ heuristics.ts               │   ├ laya.ts        │
│  ├ summarize.ts  ──message──►  │   └ jev.ts         │
│  ├ hide.ts       ◄──verdicts── ├ queue.ts (batching)│
│  └ cookies.ts                  ├ cache.ts           │
│                                └ settings.ts        │
│ popup (per-site)        options page (global)       │
└─────────────────────────────────────────────────────┘
```

### Units

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `shared/types.ts` | `ElementSummary`, `Category`, `Verdict`, `Settings`, message types | — |
| `shared/labels.ts` | The 10 labels, their criteria text, and the `choice` question builder | types |
| `providers/provider.ts` | `interface DecisionProvider { decide(states: ElementSummary[]): Promise<Verdict[]> ; health(): Promise<ProviderHealth> }` | types, labels |
| `providers/laya.ts` | POST `{base}/v1/predict/batch` in chunks ≤ 64; on 404 fall back to sequential `{base}/v1/predict`; no auth header in v1; `health()` = GET `{base}/health` | provider |
| `providers/jev.ts` | Parallel (concurrency 4) POSTs to OpenRouter Decisions with Bearer key and model id; `health()` = one tiny decision call | provider |
| `background/queue.ts` | Collects cache misses per tab for 300 ms, caps 12 per page scan (highest heuristic score first), dispatches one `decide` call, returns verdicts to the tab | provider, cache |
| `background/cache.ts` | Verdicts keyed `hostname + signature` in `chrome.storage.local`; TTL (default 7 days); max 5,000 entries, LRU eviction; also derives per-site CSS hide lists | types |
| `background/settings.ts` | Load/save/validate settings in `chrome.storage.local`; defaults; change events | types |
| `background/netrules.ts` | Enable/disable the static declarativeNetRequest ruleset per settings and per-site allowlist | settings |
| `content/candidates.ts` | Find candidate elements (see §4.1) | — |
| `content/summarize.ts` | Element → compact `ElementSummary` JSON + stable `signature` | types |
| `content/heuristics.ts` | Pure: `ElementSummary` → `{ score: 0..1, guess: Category }` | types |
| `content/hide.ts` | Hide via injected stylesheet + `data-adb-hidden`; unlock scroll; undo; debug outlines | — |
| `content/cookies.ts` | Find and click a reject/necessary-only button inside a cookie banner, once | — |
| `content/main.ts` | Orchestrates scans, MutationObserver, messaging | all content units |
| `ui/popup` | Per-site status and controls (§6.2) | messages |
| `ui/options` | Global settings (§6.1) | settings |

Pure units (`heuristics`, `summarize` on a jsdom tree, `labels`, `cache`, `providers` with mocked
`fetch`, `queue`) are unit-tested without Chrome.

## 4. Detection pipeline

### 4.1 Candidates

Elements that are visible, at least 50×20 px, and match at least one of:

- `position: fixed | sticky`
- `iframe`, `ins`, `embed`, `video` (autoplay or floating)
- covers ≥ 30 % of the viewport
- z-index ≥ 1000
- id/class/aria-label/data-* matching `ad|ads|advert|sponsor|banner|consent|cookie|gdpr|cmp|promo|newsletter|subscribe|modal|popup|overlay|paywall|chat|share|social|recommend|outbrain|taboola`

Excluded: `html`, `body`, `main`, `article`, `[role=main]`, any element containing > 50 % of the
page's visible text, and elements already processed (tracked in a `WeakSet`). Max 300 candidates
per scan.

### 4.2 ElementSummary (sent to the model)

```json
{
  "tag": "div",
  "role": "dialog",
  "classes": "fc-consent-root cmp-banner",
  "text": "We value your privacy. We and our partners use cookies…",
  "buttons": ["Accept all", "Reject all", "Manage options"],
  "link_domains": ["example-partner.com"],
  "iframe_src": "googleads.g.doubleclick.net",
  "position": "fixed bottom, covers 35% of viewport",
  "z_index": 2147483647,
  "locks_scroll": true
}
```

Text capped at 300 chars, classes at 120 chars, ≤ 6 buttons, ≤ 5 link domains. Empty fields are
omitted. **Signature** = `tag + normalised classes (digits/hashes stripped) + hash(first 80 chars of text) + iframe host`.

### 4.3 Heuristic scoring

`heuristics.ts` sums weighted signals into a 0..1 score and a guessed category, e.g.:

- iframe/script host on the bundled ad-domain list → `ad`, +0.9
- fixed + covers ≥ 30 % + text matches cookie/consent vocabulary → `cookie_consent`, +0.9
- fixed + locks scroll + text matches subscribe/newsletter → `signup_modal`, +0.6
- class matches `intercom|drift|zendesk|crisp|tawk|hubspot-messages` → `chat_widget`, +0.9
- class/id keyword match alone → +0.3

Bands:

| Score | Action |
| --- | --- |
| ≥ 0.85 | Hide immediately (if category enabled); no model call |
| ≤ 0.15 | Ignore |
| between | Cache lookup → hit: apply; miss: enqueue for the model |

Weights live in one table so they can be tuned against fixtures.

### 4.4 Model question

One `choice` question, key `kind`:

```
instructions: "What is this web page element (described by `tag`, `classes`, `text`, `buttons`, `position`)?"
criteria:
  ad                     advertisement, sponsored content, ad iframe
  cookie_consent         cookie or privacy consent banner asking to accept or reject cookies
  signup_modal           newsletter, signup, login or promo popup
  sticky_video           floating or autoplay video player
  chat_widget            customer support chat bubble
  social_bar             social media share or follow buttons
  paywall_overlay        subscription paywall or login wall covering the article
  recommendation_widget  recommended or sponsored links to other articles
  main_content           the article or main content the user came to read
  site_navigation        site header, menu, footer or navigation
```

Verdict → action: hide when label ∉ {`main_content`, `site_navigation`}, its category is enabled,
and `confidence ≥ threshold` (default 0.55). Otherwise keep. The verdict is cached either way.

### 4.5 Page timeline

1. **document_start** — network rules already active; inject cached per-site hide CSS so known
   distractions never paint.
2. **DOMContentLoaded** — candidate scan → heuristics → instant hides / cache hits / enqueue misses.
3. **Model queue** (service worker) — 300 ms batching window, ≤ 12 elements per page scan, one
   batch call. Verdicts applied on arrival; page never blocks.
4. **MutationObserver** — added nodes debounced 500 ms, only new candidates scanned. Re-scan
   budget: max 5 model batches per page load.
5. **Cookie banner** — on `cookie_consent` (heuristic or model): hide, unlock scroll, then search
   inside the banner for a button whose text matches the reject vocabulary (`reject all`,
   `decline`, `necessary only`, `only essential`, `refuse`, `ablehnen`, `refuser`, `rechazar`,
   `rifiuta`, …) and click it once. Never click accept-type buttons. Disabled when cookie mode is
   "hide only".

### 4.6 Hiding

An injected `<style>` rule `[data-adb-hidden]{display:none!important}` plus the attribute on the
element; for scroll locks, remove `overflow:hidden` / `position:fixed` from `html`/`body` via an
override rule. Each hide is recorded (selector, label, confidence, source = heuristic|model|cache)
for the popup and undo.

## 5. Providers and configuration

| Setting | Laya | Jev |
| --- | --- | --- |
| Endpoint | Base URL, default `http://localhost:8002` | Fixed `https://openrouter.ai/api/alpha/decisions` |
| Key | None in v1 — the local server runs with auth off. Planned: see README "Future work" | Required OpenRouter key (Bearer) |
| Model | Checkpoint: `english` (default) / `typed-decisions` / `multilingual` | Model id, default `~typesafe/jev-latest` |
| Call | `/v1/predict/batch`, chunks ≤ 64; 404 → `/v1/predict` sequential | One request per element, concurrency 4 |
| Timeout | 15 s | 8 s |

`host_permissions`: `<all_urls>` (content script), `https://openrouter.ai/*`, and the configured
Laya origin requested at runtime via `chrome.permissions.request` when the user saves a new URL
(default `http://localhost:8002/*` declared up front). Calls are made only from the service worker,
so the Laya server needs no CORS config and the OpenRouter key never reaches page context.

"Test connection" button in options calls `provider.health()` and shows status + measured
latency (Laya: `/health` fields `status`, `device`, `loaded`; Jev: round-trip of one tiny decision).

## 6. UI

### 6.1 Options page

- **Model**: radio Laya / Jev; provider-specific fields from §5; Test connection.
- **Categories**: toggle per category (all on by default): Ads, Cookie banners, Signup/newsletter
  modals, Sticky/autoplay video, Chat widgets, Social bars, Paywall/login overlays,
  Recommendation walls.
- **Cookie banners**: Hide + try Reject (default) / Hide only.
- **Confidence threshold**: slider 0.30–0.95, default 0.55.
- **Network ad blocking**: on/off (default on).
- **Disabled sites**: editable list.
- **Debug mode**: outline + label instead of hide.
- **Cache**: TTL days (default 7), entry count, Clear cache.

### 6.2 Popup (current tab)

- Site on/off toggle (adds/removes from disabled sites, reloads tab).
- Counts by category, and by source (network / heuristic / model / cache).
- Model status: online / offline / calls this page + last latency.
- "Show hidden" (temporarily unhide, outlined) and "Undo all on this site".

## 7. Error handling

| Situation | Behaviour |
| --- | --- |
| Model server down / network error | Borderline elements stay visible; popup shows "model offline"; heuristics, cache and network rules keep working |
| 3 consecutive failures | Back off 60 s before the next model call (per provider) |
| Timeout | Treated as failure; that batch's elements are not cached, may be retried on next page load |
| 401/403 | Jev: popup + options show "check API key"; no retries until settings change. Laya: shown as "server requires authentication (not supported yet)" |
| 402/429 (OpenRouter) | Show "quota/rate limited"; back off 5 min |
| Malformed response / missing answer | Element kept visible; logged in debug mode |
| Settings invalid (bad URL) | Options page refuses to save, inline error |

The extension never hides an element because of an error.

## 8. Testing

- **Unit (Vitest + jsdom)**: heuristics weights & bands on fixture summaries; summarize/signature
  stability; candidate filtering incl. exclusions; cache TTL/LRU; queue batching window, 12-cap,
  ordering; Laya provider (batch, chunking at 64, 404 fallback, no auth header sent) and Jev provider
  (concurrency 4, Bearer, response mapping) with mocked `fetch`; cookie reject-button matcher
  (never matches accept wording).
- **Fixture pages**: a handful of saved static HTML pages (cookie banner, newsletter modal, ad
  iframes, chat bubble, article) under `test/fixtures/`, used by jsdom tests to assert the article
  is never hidden.
- **Live model check** (opt-in script, not CI): runs the fixture summaries through the real Laya
  server and prints label accuracy + latency, to tune the threshold and heuristic bands.
- **Manual**: load `dist/` unpacked, visit ~10 real sites with debug mode on, record misses.

## 9. Project layout

```
web-ad-blocker/
  public/manifest.json              # static MV3 manifest, copied to dist/ by Vite
  rules/easylist-subset.json        # declarativeNetRequest static rules
  src/
    shared/   types.ts labels.ts messages.ts adDomains.ts
    background/ index.ts queue.ts cache.ts settings.ts netrules.ts
    providers/  provider.ts laya.ts jev.ts
    content/    main.ts candidates.ts summarize.ts heuristics.ts hide.ts cookies.ts
    ui/popup/   index.html popup.ts
    ui/options/ index.html options.ts
  test/ unit/*.test.ts fixtures/*.html
  scripts/ live-model-check.ts
  vite.config.ts vitest.config.ts tsconfig.json package.json
```
