# Privacy Policy — AI Distraction Blocker

_Effective date: October 9, 2026_

AI Distraction Blocker ("the extension") hides ads, cookie banners, popups and similar
distractions on web pages. This policy explains what data the extension handles and where it goes.

## Summary

- The extension has **no accounts, no analytics, no tracking and no servers of its own**.
- To decide whether a page element is a distraction, it may send a **short description of that
  element** to the AI model **you choose**: Jev through OpenRouter (default), or a Laya server you
  run yourself.
- Settings, your API key, your exclude list and remembered decisions are stored **only in your
  browser**.
- Nothing is sold, shared for advertising, or used for any purpose other than hiding distractions.

## What is processed on your device

The extension's content script reads the structure of the pages you visit (element types,
positions, class names and visible text) to find likely distractions. This happens inside your
browser. Obvious distractions are hidden without sending anything anywhere.

## What is sent to the AI model

For elements the built-in rules can't decide, the extension sends an **element summary** to the
model you selected in Settings. A summary contains only:

- the element's tag and ARIA role
- its id and class names (up to 120 characters)
- up to 300 characters of its **visible** text
- up to 6 button labels
- up to 5 domain names of links or embedded frames inside it
- its position and size on screen, and whether it blocks scrolling

The extension does **not** send the page URL, page title, cookies, form contents, passwords,
browsing history or any identifier for you.

Where the summary goes depends on your choice:

| Model | Recipient | Their policy |
| --- | --- | --- |
| **Jev** (default) | OpenRouter (`openrouter.ai`), which routes the request to TypeSafe's Jev model, authenticated with **your** OpenRouter API key | [OpenRouter privacy policy](https://openrouter.ai/privacy) |
| **Laya** | The server URL you enter, by default `http://localhost:8000` on your own computer | Your own server; see [docs/laya-local-setup.md](laya-local-setup.md) |

If no model is configured (for example, Jev without an API key), nothing is sent and only the
built-in rules are used.

## What is stored, and where

All of this is kept in `chrome.storage.local` on your device and is never sent to the developer:

- your settings, including your OpenRouter API key if you enter one
- your exclude list of sites
- remembered decisions: for each website hostname, a short fingerprint of hidden or judged
  elements with the label, confidence and a CSS selector, kept for 7 days by default

You can clear remembered decisions in **Settings → Cache → Clear cache**. Removing the extension
deletes all of its stored data.

## Network blocking

The extension blocks requests to a built-in list of known ad and tracking domains using Chrome's
`declarativeNetRequest` API. Chrome applies these rules locally; the extension does not see or
record the requests. The popup shows only a count of blocked requests for the current tab.

## Cookie banners

By default, when the extension finds a cookie consent banner it clicks a "Reject all" or
"Necessary only" button if one exists. It never clicks "Accept". You can switch this to
"Hide only" in Settings.

## Permissions

| Permission | Why |
| --- | --- |
| Access to all websites | Find and hide distractions on the pages you visit, and contact the Laya server URL you configure. |
| `storage` | Save settings, the exclude list and remembered decisions on your device. |
| `declarativeNetRequest` | Block requests to known ad domains. |
| `declarativeNetRequestFeedback` | Show how many ad requests were blocked on the current tab. |
| `tabs` | Let the popup read the current tab's address for per-site controls, and reload it after you change the exclude list. |

## Children

The extension is not directed at children and does not knowingly collect personal information
from anyone.

## Changes

If this policy changes, the new version will be published at the same address with a new
effective date. Material changes will also be noted in the extension's release notes.

## Contact

Questions or requests: [ratheeshspiral09@gmail.com](mailto:ratheeshspiral09@gmail.com)
