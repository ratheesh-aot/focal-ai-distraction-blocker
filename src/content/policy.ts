import { isCategory } from '../shared/labels';
import type { Settings, Verdict } from '../shared/types';

/** A verdict hides its element only for an enabled distraction category at or above the threshold. */
export function shouldHide(v: Verdict, s: Settings): boolean {
  return isCategory(v.label) && s.categories[v.label] && v.confidence >= s.threshold;
}
