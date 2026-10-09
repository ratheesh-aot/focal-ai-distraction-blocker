import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/background/settings';
import { applyCachedSelectors } from '../src/content/cached';
import { Hider } from '../src/content/hide';
import type { CacheEntry } from '../src/shared/types';
import { loadHtml } from './helpers';

const doc = () => loadHtml('<body><div id="consent">Cookies <button>Reject all</button></div><div class="chat-bubble">Hi</div></body>');
const entry = (label: CacheEntry['label'], selector: string, confidence = 0.9): CacheEntry => ({ label, confidence, at: 0, selector });

describe('applyCachedSelectors', () => {
  it('records elements hidden by cached selectors so the popup counts them', () => {
    const d = doc();
    const hider = new Hider(d, { debug: false });
    applyCachedSelectors(d, { a: entry('cookie_consent', '#consent'), b: entry('chat_widget', 'div.chat-bubble') }, DEFAULT_SETTINGS, hider, () => {});
    expect(hider.stats()).toEqual({ hidden: 2, byCategory: { cookie_consent: 1, chat_widget: 1 }, bySource: { cache: 2 } });
    expect(d.getElementById('consent')!.hasAttribute('data-adb-hidden')).toBe(true);
  });

  it('hands cookie banners to the reject step', () => {
    const d = doc();
    const onCookie = vi.fn();
    applyCachedSelectors(d, { a: entry('cookie_consent', '#consent') }, DEFAULT_SETTINGS, new Hider(d, { debug: false }), onCookie);
    expect(onCookie).toHaveBeenCalledWith(d.getElementById('consent'));
  });

  it('skips disabled categories, low confidence, content labels and bad selectors', () => {
    const d = doc();
    const hider = new Hider(d, { debug: false });
    const settings = { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, chat_widget: false } };
    applyCachedSelectors(
      d,
      {
        a: entry('chat_widget', 'div.chat-bubble'),
        b: entry('cookie_consent', '#consent', 0.2),
        c: entry('main_content', '#consent'),
        d: entry('ad', 'div[[['),
      },
      settings,
      hider,
      () => {},
    );
    expect(hider.stats().hidden).toBe(0);
  });
});
