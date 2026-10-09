import type { CandidateInfo, Category } from '../shared/types';

export const HIDE_NOW = 0.85;
export const IGNORE_BELOW = 0.15;
/** Share of the viewport above which an unexplained floating element is sent to the model. */
const LARGE_OVERLAY = 0.2;

export type Band = 'hide' | 'ask' | 'ignore';

export function band(score: number): Band {
  if (score >= HIDE_NOW) return 'hide';
  if (score <= IGNORE_BELOW) return 'ignore';
  return 'ask';
}

const COOKIE_TEXT = /\b(cookies?|consent|gdpr|privacy|tracking technologies)\b/i;
const CONSENT_BUTTON = /\b(accept|agree|allow|reject|decline|necessary|essential|manage|preferences|ok)\b/i;
const CHAT_VENDOR = /intercom|drift|zendesk|crisp|tawk|hubspot-messages|livechat|tidio|olark|freshchat/i;
const RECOMMENDATION_VENDOR = /outbrain|taboola|revcontent|mgid|zergnet/i;
const SIGNUP_TEXT = /\b(subscribe|newsletter|sign ?up|inbox|don'?t miss|join (us|now)|create (a|an) (free )?account)\b/i;
const PAYWALL = /paywall|regwall|piano|tp-modal|metered/i;
const STICKY_VIDEO = /sticky-video|floating-player|video-float|jw-flag-floating|vjs-pip|mini-player/i;
const SOCIAL = /(^|[\s_-])(share|social|follow)([\s_-]|$)/i;
const AD_WORD = /(^|[\s_-])(ad|ads|advert|advertisement|adunit|adslot|ad-slot|ad-unit|sponsor|sponsored|dfp|gpt-ad|banner-ad)([\s_-]|$)/i;
const POPUP_WORD = /(^|[\s_-])(promo|popup|pop-up|modal|overlay|lightbox|interstitial)([\s_-]|$)/i;

interface Signal {
  category: Category;
  weight: number;
}

/**
 * Cheap, explainable score for how likely an element is a distraction.
 * score = min(1, sum of signal weights); guess = category of the strongest signal.
 */
export function scoreCandidate({ summary, features }: CandidateInfo): { score: number; guess: Category | null } {
  const names = `${summary.classes ?? ''} ${summary.role ?? ''}`;
  const text = summary.text ?? '';
  const buttons = (summary.buttons ?? []).join(' ');
  const floating = features.fixed || features.sticky;
  const signals: Signal[] = [];

  if (features.adHost) signals.push({ category: 'ad', weight: 0.9 });

  if (COOKIE_TEXT.test(text) || COOKIE_TEXT.test(names)) {
    const strong = floating && features.coverage >= 0.1 && CONSENT_BUTTON.test(buttons);
    signals.push({ category: 'cookie_consent', weight: strong ? 0.9 : floating ? 0.5 : 0.2 });
  }

  if (CHAT_VENDOR.test(names) || CHAT_VENDOR.test(summary.iframe_src ?? '')) {
    signals.push({ category: 'chat_widget', weight: 0.9 });
  }

  if (RECOMMENDATION_VENDOR.test(names) || RECOMMENDATION_VENDOR.test(summary.iframe_src ?? '')) {
    signals.push({ category: 'recommendation_widget', weight: 0.9 });
  }

  if (floating && SIGNUP_TEXT.test(text)) {
    signals.push({ category: 'signup_modal', weight: features.locksScroll ? 0.6 : 0.4 });
  }

  if (PAYWALL.test(names)) signals.push({ category: 'paywall_overlay', weight: 0.5 });

  if (floating && (summary.tag === 'video' || STICKY_VIDEO.test(names))) {
    signals.push({ category: 'sticky_video', weight: 0.6 });
  }

  if (SOCIAL.test(names) && text.length < 120) signals.push({ category: 'social_bar', weight: 0.35 });

  if (AD_WORD.test(names)) signals.push({ category: 'ad', weight: 0.3 });
  if (POPUP_WORD.test(names)) signals.push({ category: 'signup_modal', weight: 0.3 });

  if (signals.length === 0) {
    // A large overlay with no tell-tale names is exactly what the model is for: ask it.
    return floating && features.coverage >= LARGE_OVERLAY ? { score: 0.3, guess: null } : { score: 0, guess: null };
  }

  const strongest = signals.reduce((a, b) => (b.weight > a.weight ? b : a));
  let score = signals.reduce((sum, s) => sum + s.weight, 0);
  if (floating) score += 0.1;
  if (features.zIndex >= 1000) score += 0.05;
  return { score: Math.min(1, score), guess: strongest.category };
}
