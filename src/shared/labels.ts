import type { Category, Label } from './types';

const CRITERIA: Record<Label, string> = {
  ad: 'advertisement, sponsored content, ad iframe',
  cookie_consent: 'cookie or privacy consent banner asking to accept or reject cookies',
  signup_modal: 'newsletter, signup, login or promo popup',
  sticky_video: 'floating or autoplay video player',
  chat_widget: 'customer support chat bubble',
  social_bar: 'social media share or follow buttons',
  paywall_overlay: 'subscription paywall or login wall covering the article',
  recommendation_widget: 'recommended or sponsored links to other articles',
  main_content: 'the article or main content the user came to read',
  site_navigation: 'site header, menu, footer or navigation',
};

export const LABELS = Object.keys(CRITERIA) as Label[];

export const CATEGORIES = LABELS.filter(
  (l): l is Category => l !== 'main_content' && l !== 'site_navigation',
);

export const CATEGORY_NAMES: Record<Category, string> = {
  ad: 'Ads',
  cookie_consent: 'Cookie banners',
  signup_modal: 'Signup / newsletter modals',
  sticky_video: 'Sticky / autoplay video',
  chat_widget: 'Chat widgets',
  social_bar: 'Social bars',
  paywall_overlay: 'Paywall / login overlays',
  recommendation_widget: 'Recommendation walls',
};

export function isCategory(label: Label): label is Category {
  return (CATEGORIES as Label[]).includes(label);
}

export function isLabel(value: unknown): value is Label {
  return typeof value === 'string' && value in CRITERIA;
}

export function buildQuestions() {
  return {
    kind: {
      type: 'choice' as const,
      instructions:
        'What is this web page element (described by `tag`, `classes`, `text`, `buttons`, `position`)?',
      criteria: { ...CRITERIA },
    },
  };
}
