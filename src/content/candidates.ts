import { coverage, domMeasure, viewport as liveViewport, type Measure, type Viewport } from './measure';
import { visibleText } from './visible';

export const MAX_CANDIDATES = 300;
const MIN_WIDTH = 50;
const MIN_HEIGHT = 20;

const MEDIA_TAGS = new Set(['IFRAME', 'INS', 'EMBED', 'VIDEO']);
const NEVER = new Set(['HTML', 'BODY', 'MAIN', 'ARTICLE', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR', 'SVG']);
const KEYWORD =
  /(^|[\s_-])(ad|ads|advert|advertisement|sponsor|sponsored|banner|consent|cookie|cookies|gdpr|cmp|promo|newsletter|subscribe|modal|popup|overlay|paywall|chat|share|social|recommend|recommended|outbrain|taboola)([\s_-]|$)/i;
/** An element is treated as "the content" when it holds more than half the page text (and a fair amount of it). */
const CONTENT_SHARE = 0.5;
const CONTENT_MIN_CHARS = 300;

export interface FindOptions {
  measure?: Measure;
  viewport?: Viewport;
  seen?: WeakSet<Element>;
  roots?: Element[];
}

function names(el: Element): string {
  return `${el.id} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('aria-label') ?? ''}`;
}

function holdsContent(el: Element, bodyTextLength: number): boolean {
  if (el.matches('[role="main"]') || el.querySelector('main, article, [role="main"]')) return true;
  // textContent is a cheap upper bound; only measure rendered text when it could matter.
  if ((el.textContent ?? '').length < CONTENT_MIN_CHARS) return false;
  const len = visibleText(el).length;
  return len >= CONTENT_MIN_CHARS && bodyTextLength > 0 && len / bodyTextLength > CONTENT_SHARE;
}

/**
 * Elements that might be distractions, in document order. Descendants of a floating
 * (fixed/sticky) candidate are skipped: the overlay is judged as a whole.
 */
export function findCandidates(doc: Document, opts: FindOptions = {}): Element[] {
  const measure = opts.measure ?? domMeasure;
  const vp = opts.viewport ?? liveViewport();
  const body = doc.body;
  if (!body) return [];
  const bodyTextLength = visibleText(body).length;
  const roots = opts.roots ?? [body];
  const found: Element[] = [];
  let lastFloating: Element | null = null;

  for (const root of roots) {
    const all = root === body ? body.querySelectorAll('*') : [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (found.length >= MAX_CANDIDATES) return found;
      if (NEVER.has(el.tagName.toUpperCase()) || el.closest('svg')) continue;
      if (lastFloating?.contains(el)) continue;
      if (opts.seen?.has(el)) continue;

      const m = measure(el);
      if (m.display === 'none' || m.visibility === 'hidden') continue;
      if (m.rect.width < MIN_WIDTH || m.rect.height < MIN_HEIGHT) continue;

      const floating = m.position === 'fixed' || m.position === 'sticky';
      const isCandidate =
        floating ||
        MEDIA_TAGS.has(el.tagName.toUpperCase()) ||
        (m.position === 'absolute' && coverage(m.rect, vp) >= 0.3) ||
        (m.position !== 'static' && m.zIndex >= 1000) ||
        KEYWORD.test(names(el));
      if (!isCandidate) continue;
      if (holdsContent(el, bodyTextLength)) continue;

      found.push(el);
      if (floating) lastFloating = el;
    }
  }
  return found;
}
