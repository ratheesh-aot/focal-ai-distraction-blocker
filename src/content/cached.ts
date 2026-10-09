import type { CacheEntry, Settings } from '../shared/types';
import type { Hider } from './hide';
import { shouldHide } from './policy';

/**
 * Marks elements matched by cached selectors as hidden. The injected stylesheet already hides
 * them before paint, but scans skip display:none elements, so without this they would be
 * missing from the popup counts and cookie banners would never get their Reject click.
 */
export function applyCachedSelectors(
  doc: Document,
  cached: Record<string, CacheEntry>,
  settings: Settings,
  hider: Hider,
  onCookieBanner: (el: Element) => void,
): void {
  for (const e of Object.values(cached)) {
    if (!e.selector || !shouldHide(e, settings)) continue;
    let matches: Element[];
    try {
      matches = [...doc.querySelectorAll(e.selector)];
    } catch {
      continue;
    }
    for (const el of matches) {
      if (e.label === 'cookie_consent') onCookieBanner(el);
      hider.hide(el, { label: e.label, confidence: e.confidence, source: 'cache' });
    }
  }
}
