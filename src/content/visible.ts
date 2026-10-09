/**
 * Rendered-text helpers. Consent dialogs often carry tens of kilobytes of collapsed
 * "details" (cookie tables); textContent counts them, what the user sees does not.
 */

function hiddenByMarkup(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    if (p.hasAttribute('hidden')) return true;
    const style = (p as HTMLElement).style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  return false;
}

/** True when the element is drawn. Uses checkVisibility in Chrome; markup checks elsewhere (jsdom). */
export function isRendered(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  if (typeof check === 'function') return check.call(el, { visibilityProperty: true });
  return !hiddenByMarkup(el);
}

/** The text a user can see in `el`, whitespace-collapsed. */
export function visibleText(el: Element): string {
  const inner = (el as HTMLElement).innerText;
  if (typeof inner === 'string') return inner.replace(/\s+/g, ' ').trim();
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 0x4 /* NodeFilter.SHOW_TEXT */);
  const parts: string[] = [];
  const rendered = new Map<Element, boolean>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent) continue;
    let ok = rendered.get(parent);
    if (ok === undefined) rendered.set(parent, (ok = !hiddenByMarkup(parent)));
    if (ok) parts.push(n.nodeValue ?? '');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
