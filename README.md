# AI Distraction Blocker

A Chrome extension (Manifest V3) that hides things that distract you from a page's real content:
ads, cookie consent banners, signup/newsletter modals, sticky/autoplay video, chat and social
widgets, paywall overlays and recommendation walls.

It works in three layers:

1. **Network rules** — known ad/tracker domains are blocked before they load.
2. **Page heuristics** — obvious distractions (e.g. a full-screen cookie banner) are hidden instantly.
3. **AI model** — borderline elements are classified by a typed-decision model, in batches, with
   results cached per site so repeat visits make no model calls.

The model is selectable in the extension's settings:

| Model | How it is reached | Configuration |
| --- | --- | --- |
| **Jev** (TypeSafe) — **default** | OpenRouter Decisions API | OpenRouter API key; model id, default `~typesafe/jev-latest` |
| **Laya** (Convai, open weights) — **free** | Your own [Laya local HTTP server](https://github.com/ratheesh-aot/laya-local-http-server) | Base URL, default `http://localhost:8000`; checkpoint (`english` / `typed-decisions` / `multilingual`) |

**Want it free and private?** Follow [docs/laya-local-setup.md](docs/laya-local-setup.md) to run Laya
on your own computer and point the extension at it.

Design details: [docs/superpowers/specs/2026-10-09-ai-distraction-blocker-design.md](docs/superpowers/specs/2026-10-09-ai-distraction-blocker-design.md)

## Build and install

Requires Node 20+.

```bash
npm install
npm run build        # outputs the unpacked extension to dist/
```

In Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the
`dist/` folder. After rebuilding, press the reload icon on the extension card.

## Configure

Open the extension's **Settings** (toolbar icon → Settings, or right-click → Options):

Settings opens automatically the first time the extension is installed.

- **Model** — pick Jev (default) or Laya.
  - Jev: your OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys)) and model id.
    Until a key is entered, only network blocking and the built-in rules run.
  - Laya: server URL (default `http://localhost:8000`) and checkpoint. See
    [docs/laya-local-setup.md](docs/laya-local-setup.md).
  - **Test connection** checks the server and shows its latency.
- **What to block** — one toggle per category.
- **Cookie banners** — hide and click "Reject all" / "Necessary only" (default), or hide only.
  The extension never clicks an accept button.
- **Model confidence needed to hide** — default 0.55. Raise it if real content gets hidden.
- **Debug mode** — outlines detections with their label, confidence and source instead of hiding them.
- **Excluded sites** — add a site (host or full URL) or remove one; changes apply immediately. The
  extension does nothing on excluded sites, subdomains included, and network blocking is off there too.

The toolbar popup shows what was hidden on the current page and the model status, with:

- **Disable on this site** — adds the current site to the exclude list and reloads the tab. On an
  excluded site the button reads **Remove from exclude list**.
- **Show hidden** — temporarily reveals (and outlines) everything hidden on the page.
- **Excluded sites** — the full list, each with **Remove**, plus a box to add any site.

## How fast is it?

On a Windows laptop CPU, laya-api answers in roughly **0.5–0.8 s per element** when batched
(about 2.6 s for a single request). Pages never wait for it: obvious distractions are hidden
immediately by heuristics, borderline ones are sent in one batch of at most 12 per scan, and every
verdict is cached per site for 7 days, so repeat visits make no model calls.

## Development

```bash
npm test             # unit tests (Vitest + jsdom)
npm run typecheck
npm run live-check   # labelled samples through your Laya server: accuracy + latency
                     #   npm run live-check -- http://localhost:8002 typed-decisions
npm run e2e          # loads dist/ into Chromium and checks a test page end to end
                     #   needs: npm run build, Laya running, npx playwright install chromium
                     #   Laya URL: LAYA_URL=http://localhost:8000 npm run e2e (default :8002)
```

## How accurate is it?

Laya is used zero-shot. On 12 labelled sample elements (`npm run live-check`) it labels all 12
correctly when the markup carries telling class names (`newsletter-modal`, `OUTBRAIN`, …), at about
0.5 s per element on a laptop CPU. With class names removed it gets 10 of 12, and several correct
answers fall below the 0.55 confidence threshold: it stays reliable for ads, cookie banners, the
article and navigation, and is weak on signup popups and paywalls. The built-in rules catch the
common versions of those, and the threshold keeps low-confidence guesses from hiding anything.

## Publish to the Chrome Web Store

```bash
npm run store-assets   # icons + 1280x800 screenshots + 440x280 promo tile (needs Laya running)
npm run package        # releases/ai-distraction-blocker-<version>.zip
```

Then follow [docs/store-listing.md](docs/store-listing.md): it has the listing text, permission
justifications, data-use answers and the asset list. The privacy policy is
[docs/privacy-policy.md](docs/privacy-policy.md) — publish it at a public URL first. Raise
`"version"` in `public/manifest.json` for every update.

## Future work

### Laya API authentication

v1 talks to the Laya server **without authentication**: the local laya-api server runs with
`LAYA_API_KEYS` unset, which is appropriate while it is bound to `127.0.0.1`.

Before the Laya server is exposed beyond localhost (bound to `0.0.0.0`, shared on a LAN, or hosted),
authentication must be added on both sides:

- **Server**: set `LAYA_API_KEYS` (comma-separated) in laya-api and confirm which header it reads
  (e.g. `Authorization: Bearer <key>` or `X-API-Key`).
- **Extension**:
  - Add an optional **API key** field to the Laya section of the options page, stored in
    `chrome.storage.local`.
  - Send the key from `providers/laya.ts` on every request, including `/health` for
    "Test connection".
  - Map 401/403 to a clear "check Laya API key" status in the popup and options page, with no
    retries until settings change (same behaviour as Jev).
  - Unit-test that the header is sent when a key is set and omitted when it is empty.
  - Use HTTPS for any non-localhost Laya URL so the key is not sent in clear text.
