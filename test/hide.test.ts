import { describe, expect, it } from 'vitest';
import { Hider, stableSelector } from '../src/content/hide';
import { shouldHide } from '../src/content/policy';
import { DEFAULT_SETTINGS } from '../src/background/settings';
import { loadHtml } from './helpers';

const page = () =>
  loadHtml('<html><head></head><body><div id="banner" class="cmp">Cookies</div><div class="ad-box">Ad</div><p>Text</p></body></html>');

describe('Hider', () => {
  it('hides an element with an attribute and a page stylesheet', () => {
    const doc = page();
    const h = new Hider(doc, { debug: false });
    const el = doc.getElementById('banner')!;
    h.hide(el, { label: 'cookie_consent', confidence: 0.9, source: 'heuristic' });
    expect(el.hasAttribute('data-adb-hidden')).toBe(true);
    expect(doc.getElementById('adb-style')!.textContent).toContain('[data-adb-hidden]');
    expect(h.stats()).toEqual({ hidden: 1, byCategory: { cookie_consent: 1 }, bySource: { heuristic: 1 } });
  });

  it('only outlines elements in debug mode', () => {
    const doc = page();
    const el = doc.getElementById('banner')!;
    new Hider(doc, { debug: true }).hide(el, { label: 'ad', confidence: 0.61, source: 'model' });
    expect(el.hasAttribute('data-adb-hidden')).toBe(false);
    expect(el.getAttribute('data-adb-debug')).toBe('ad 0.61 (model)');
  });

  it('does not count the same element twice', () => {
    const doc = page();
    const h = new Hider(doc, { debug: false });
    const el = doc.getElementById('banner')!;
    h.hide(el, { label: 'ad', confidence: 0.9, source: 'model' });
    h.hide(el, { label: 'ad', confidence: 0.9, source: 'model' });
    expect(h.stats().hidden).toBe(1);
  });

  it('undoAll restores every element, scrolling and cached rules', () => {
    const doc = page();
    const h = new Hider(doc, { debug: false });
    const el = doc.getElementById('banner')!;
    h.injectSelectors(['.ad-box']);
    h.hide(el, { label: 'ad', confidence: 0.9, source: 'model' });
    h.unlockScroll();
    h.undoAll();
    expect(el.hasAttribute('data-adb-hidden')).toBe(false);
    expect(doc.documentElement.classList.contains('adb-unlock')).toBe(false);
    expect(doc.getElementById('adb-cached')).toBeNull();
    expect(h.stats().hidden).toBe(0);
  });

  it('showHidden toggles a class that reveals hidden elements', () => {
    const doc = page();
    const h = new Hider(doc, { debug: false });
    h.showHidden(true);
    expect(doc.documentElement.classList.contains('adb-show')).toBe(true);
    h.showHidden(false);
    expect(doc.documentElement.classList.contains('adb-show')).toBe(false);
  });

  it('unlockScroll adds the override class', () => {
    const doc = page();
    new Hider(doc, { debug: false }).unlockScroll();
    expect(doc.documentElement.classList.contains('adb-unlock')).toBe(true);
  });

  it('skips invalid cached selectors instead of breaking the stylesheet', () => {
    const doc = page();
    new Hider(doc, { debug: false }).injectSelectors(['.ad-box', 'div[[[']);
    const css = doc.getElementById('adb-cached')!.textContent!;
    expect(css).toContain('.ad-box');
    expect(css).not.toContain('div[[[');
  });
});

describe('stableSelector', () => {
  it('uses a readable id', () => {
    const doc = page();
    expect(stableSelector(doc.getElementById('banner')!)).toBe('#banner');
  });
  it('rejects generated ids and falls back to unique classes', () => {
    const doc = loadHtml('<body><div id="ad-123456" class="ad-box sidebar">x</div><div class="sidebar">y</div></body>');
    expect(stableSelector(doc.querySelector('.ad-box')!)).toBe('div.ad-box.sidebar');
  });
  it('returns null when nothing identifies the element uniquely', () => {
    const doc = loadHtml('<body><div class="x">a</div><div class="x">b</div></body>');
    expect(stableSelector(doc.querySelector('.x')!)).toBeNull();
  });
});

describe('shouldHide', () => {
  it('hides an enabled distraction category at or above the threshold', () => {
    expect(shouldHide({ label: 'ad', confidence: 0.55 }, DEFAULT_SETTINGS)).toBe(true);
    expect(shouldHide({ label: 'ad', confidence: 0.54 }, DEFAULT_SETTINGS)).toBe(false);
  });
  it('never hides main content or navigation', () => {
    expect(shouldHide({ label: 'main_content', confidence: 1 }, DEFAULT_SETTINGS)).toBe(false);
    expect(shouldHide({ label: 'site_navigation', confidence: 1 }, DEFAULT_SETTINGS)).toBe(false);
  });
  it('respects disabled categories', () => {
    const s = { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, chat_widget: false } };
    expect(shouldHide({ label: 'chat_widget', confidence: 1 }, s)).toBe(false);
  });
});
