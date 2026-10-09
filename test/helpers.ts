import type { Measure } from '../src/content/measure';
import type { CandidateInfo, ElementSummary, Features } from '../src/shared/types';

export function info(summary: Partial<ElementSummary>, features: Partial<Features> = {}): CandidateInfo {
  return {
    summary: { tag: 'div', position: 'static', ...summary },
    features: {
      fixed: false,
      sticky: false,
      coverage: 0.05,
      zIndex: 0,
      locksScroll: false,
      adHost: false,
      area: 20000,
      ...features,
    },
  };
}

/** jsdom has no layout: read geometry from data-rect="w,h,top,left", data-pos, data-z. */
export const fakeMeasure: Measure = (el) => {
  const [width, height, top, left] = (el.getAttribute('data-rect') ?? '600,40,0,0').split(',').map(Number);
  const style = (el as HTMLElement).style;
  return {
    rect: { width, height, top, left },
    position: el.getAttribute('data-pos') ?? 'static',
    zIndex: Number(el.getAttribute('data-z') ?? 0),
    display: style?.display || 'block',
    visibility: style?.visibility || 'visible',
  };
};

export const VIEWPORT = { width: 1000, height: 800 };

export function loadHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}
