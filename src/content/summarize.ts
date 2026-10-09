import { isAdHost } from '../shared/adDomains';
import type { CandidateInfo, ElementSummary } from '../shared/types';
import { coverage, type Measured, type Viewport } from './measure';

const MAX_TEXT = 300;
const MAX_CLASSES = 120;
const MAX_BUTTONS = 6;
const MAX_LINK_DOMAINS = 5;
const BUTTON_SELECTOR =
  'button, [role="button"], input[type="button"], input[type="submit"], a[class*="btn"], a[class*="button"]';

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function hostOfSrc(src: string | null, base: string): string {
  if (!src) return '';
  try {
    return new URL(src, base).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function where(m: Measured, vp: Viewport): string {
  const { top, height, left, width } = m.rect;
  let v = 'center';
  if (top + height >= vp.height * 0.8 && top > vp.height * 0.3) v = 'bottom';
  else if (top <= vp.height * 0.2 && height < vp.height * 0.5) v = 'top';
  if (width < vp.width * 0.5) v += left + width / 2 > vp.width / 2 ? '-right' : '-left';
  return v;
}

export function summarize(el: Element, m: Measured, vp: Viewport, pageLocked: boolean): CandidateInfo {
  const base = el.ownerDocument.baseURI || 'about:blank';
  const pageHost = el.ownerDocument.location?.hostname ?? '';
  const tag = el.tagName.toLowerCase();
  const fixed = m.position === 'fixed';
  const sticky = m.position === 'sticky';
  const floating = fixed || sticky;
  const cov = coverage(m.rect, vp);

  const summary: ElementSummary = {
    tag,
    position: floating
      ? `${m.position} ${where(m, vp)}, covers ${Math.round(cov * 100)}% of viewport`
      : `in page, ${Math.round(m.rect.width)}x${Math.round(m.rect.height)}`,
  };

  const role = el.getAttribute('role');
  if (role) summary.role = role;

  const classes = clean(`${el.id} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('aria-label') ?? ''}`);
  if (classes) summary.classes = classes.slice(0, MAX_CLASSES);

  const text = clean(el.textContent);
  if (text) summary.text = text.slice(0, MAX_TEXT);

  const buttons = [...el.querySelectorAll(BUTTON_SELECTOR)]
    .map((b) => clean(b.textContent) || clean((b as HTMLInputElement).value))
    .filter((t) => t && t.length <= 40)
    .slice(0, MAX_BUTTONS);
  if (buttons.length) summary.buttons = buttons;

  const linkHosts = new Set<string>();
  for (const a of el.querySelectorAll('a[href]')) {
    const h = hostOfSrc(a.getAttribute('href'), base);
    if (h && h !== pageHost) linkHosts.add(h);
    if (linkHosts.size >= MAX_LINK_DOMAINS) break;
  }
  if (linkHosts.size) summary.link_domains = [...linkHosts];

  const frame = tag === 'iframe' ? el : el.querySelector('iframe');
  const frameHost = hostOfSrc(frame?.getAttribute('src') ?? null, base);
  if (frameHost) summary.iframe_src = frameHost;

  if (m.zIndex > 0) summary.z_index = m.zIndex;
  const locksScroll = pageLocked && floating;
  if (locksScroll) summary.locks_scroll = true;

  return {
    summary,
    features: {
      fixed,
      sticky,
      coverage: cov,
      zIndex: m.zIndex,
      locksScroll,
      adHost: (!!frameHost && isAdHost(frameHost)) || [...linkHosts].some(isAdHost),
      area: m.rect.width * m.rect.height,
    },
  };
}

/** Drops generated parts of class tokens ("css-1a2b3c" -> "css-") so signatures survive rebuilds. */
function normaliseClasses(classes: string): string {
  return classes
    .split(' ')
    .map((t) => {
      if (!/\d/.test(t)) return t;
      const cut = Math.max(t.lastIndexOf('-'), t.lastIndexOf('_'));
      return cut > 0 ? t.slice(0, cut + 1) : '';
    })
    .filter(Boolean)
    .sort()
    .join(' ');
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Stable identity for an element across page loads, used as the cache key. */
export function signatureOf(s: ElementSummary): string {
  return [s.tag, normaliseClasses(s.classes ?? ''), hash((s.text ?? '').slice(0, 80)), s.iframe_src ?? ''].join('|');
}
