export interface Measured {
  rect: { width: number; height: number; top: number; left: number };
  position: string;
  zIndex: number;
  display: string;
  visibility: string;
}

export type Measure = (el: Element) => Measured;

export interface Viewport {
  width: number;
  height: number;
}

export const domMeasure: Measure = (el) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    rect: { width: r.width, height: r.height, top: r.top, left: r.left },
    position: cs.position,
    zIndex: Number.parseInt(cs.zIndex, 10) || 0,
    display: cs.display,
    visibility: cs.visibility,
  };
};

export function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Fraction of the viewport covered by the visible part of `rect`, 0..1, two decimals. */
export function coverage(rect: Measured['rect'], vp: Viewport): number {
  const w = Math.max(0, Math.min(rect.left + rect.width, vp.width) - Math.max(rect.left, 0));
  const h = Math.max(0, Math.min(rect.top + rect.height, vp.height) - Math.max(rect.top, 0));
  const area = vp.width * vp.height;
  return area > 0 ? Math.round(((w * h) / area) * 100) / 100 : 0;
}

/** True when the page has disabled scrolling, typically behind a modal. */
export function pageLocksScroll(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  const locked = (el: Element | null) => {
    if (!el) return false;
    const cs = view.getComputedStyle(el);
    return cs.overflow === 'hidden' || cs.overflowY === 'hidden';
  };
  const body = doc.body;
  return locked(doc.documentElement) || locked(body) || (!!body && view.getComputedStyle(body).position === 'fixed');
}
