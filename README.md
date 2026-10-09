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
| **Laya** (Convai, open weights) | Your own laya-api server | Base URL, default `http://localhost:8002`; checkpoint (`english` / `typed-decisions` / `multilingual`) |
| **Jev** (TypeSafe) | OpenRouter Decisions API | OpenRouter API key; model id, default `~typesafe/jev-latest` |

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

- **Model** — pick Laya or Jev.
  - Laya: server URL (default `http://localhost:8002`) and checkpoint. Start laya-api first.
  - Jev: your OpenRouter API key and model id.
  - **Test connection** checks the server and shows its latency.
- **What to block** — one toggle per category.
- **Cookie banners** — hide and click "Reject all" / "Necessary only" (default), or hide only.
  The extension never clicks an accept button.
- **Model confidence needed to hide** — default 0.55. Raise it if real content gets hidden.
- **Debug mode** — outlines detections with their label, confidence and source instead of hiding them.
- **Disabled sites** — the extension does nothing on these sites (subdomains included).

The toolbar popup shows what was hidden on the current page, the model status, a site on/off switch,
**Show hidden** and **Undo all on this site**.

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
```

Last live check (english checkpoint, CPU): 12/12 correct, ~0.5 s per element.

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
