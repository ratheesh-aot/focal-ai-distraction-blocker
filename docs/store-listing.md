# Chrome Web Store submission kit

Everything to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
for **Focal: AI Distraction Blocker**. Developer contact: ratheeshspiral09@gmail.com.

## Before you submit

1. `npm run store-assets` — regenerates icons and store images (needs a local Laya server).
2. Raise `"version"` in `public/manifest.json` for every upload after the first.
3. `npm run package` — builds and writes `releases/focal-<version>.zip`.
4. Publish `docs/privacy-policy.md` at a public URL (for example, push this repo to GitHub and use
   the file's GitHub URL, or GitHub Pages) and fill it in below.

## Package

Upload `releases/focal-<version>.zip`.

## Store listing tab

**Name** (from the manifest): Focal: AI Distraction Blocker

**Summary** (manifest `description`, max 132 characters):

> Hides ads, cookie banners, popups and other distractions using the Laya or Jev decision model.

**Category:** Productivity → Workflow & Planning (or "Tools")

**Language:** English

**Detailed description:**

```
Read the page, not the popups.

Focal hides the things that pull you away from what you came to read: ads, cookie consent banners, newsletter and signup popups, floating video players, chat bubbles, social share bars, paywall overlays and "recommended for you" walls.

HOW IT WORKS
• Known ad and tracker servers are blocked before they load.
• Obvious distractions — a full-width cookie bar, a known chat widget, an ad iframe — are hidden instantly by built-in rules.
• Borderline elements are judged by a small AI decision model, in the background, so pages never wait. Decisions are remembered per site, so repeat visits are instant.
• Cookie banners: clicks "Reject all" / "Necessary only" when available. It never clicks "Accept".

CHOOSE YOUR MODEL
• Jev via OpenRouter (default) — add your OpenRouter API key in Settings. Typical cost is a tiny fraction of a cent per page.
• Laya, free and private — run Convai's open-weight Laya model on your own computer with the free Laya local HTTP server (github.com/ratheesh-aot/laya-local-http-server) and enter its URL. Nothing leaves your machine.
Without a model, the network blocking and built-in rules still work.

YOU STAY IN CONTROL
• Pick which categories to hide.
• "Disable on this site" in one click; manage your exclude list from the toolbar.
• "Show hidden" reveals everything that was hidden on the page.
• Debug mode outlines detections with their label and confidence instead of hiding them.
• Adjustable confidence threshold.

PRIVACY
No accounts, no analytics, no tracking. Only a short description of an element (tag, class names, up to 300 characters of visible text, button labels, link domains, position) is sent to the model you choose — never the page URL, cookies or form data. Full policy: <PRIVACY POLICY URL>
```

**Graphic assets** (all in `store/`):

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `public/icons/icon-128.png` | 128×128 |
| Screenshot 1 | `store/screenshot-1-before-after.png` | 1280×800 |
| Screenshot 2 | `store/screenshot-2-popup.png` | 1280×800 |
| Screenshot 3 | `store/screenshot-3-settings.png` | 1280×800 |
| Small promo tile | `store/promo-small-440x280.png` | 440×280 |

**Official URL / Homepage URL:** your repository URL (optional)

**Support URL:** `mailto:ratheeshspiral09@gmail.com` or your repository's issues page

## Privacy practices tab

**Single purpose description:**

> Hides ads, cookie consent banners, popups and other on-page distractions so the user can read a page's main content.

**Permission justifications:**

| Permission | Justification to paste |
| --- | --- |
| `host_permissions: <all_urls>` | The content script must run on every page the user visits to find and hide distracting elements. The service worker also sends element summaries to the model endpoint the user configures, which can be any URL (for example a Laya server on localhost). |
| `storage` | Stores the user's settings, OpenRouter API key, exclude list and cached per-site decisions locally on the device. |
| `declarativeNetRequest` | Blocks network requests to a bundled list of known advertising and tracking domains. |
| `declarativeNetRequestFeedback` | Reads how many requests were blocked on the active tab to show that count in the popup. |
| `tabs` | The popup reads the active tab's URL to show per-site controls (disable on this site, counts) and reloads the tab after the user changes the exclude list. |

**Are you using remote code?** No, I am not using remote code. All JavaScript is included in the package.

**Data usage — what user data do you collect?** Tick **Website content** only.
(Text, class names and link domains of individual page elements are sent to the user-selected
model to classify them.) Do not tick personally identifiable information, health, financial,
authentication, personal communications, location, web history or user activity.

**Certifications** — tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `<PRIVACY POLICY URL>` (the published `docs/privacy-policy.md`)

## Distribution tab

- **Visibility:** Public (or Unlisted to share by link only while testing)
- **Regions:** All regions

## Notes for the reviewer (optional field)

```
The extension works without any account. To test the AI step: open Settings (opens automatically on install), choose "Jev" and enter an OpenRouter API key, or choose "Laya" and run the free local server from github.com/ratheesh-aot/laya-local-http-server. Without a model, network blocking and the built-in rules still hide obvious ads and cookie banners. Debug mode (Settings) outlines each detection with its label instead of hiding it.
```
