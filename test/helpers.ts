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
