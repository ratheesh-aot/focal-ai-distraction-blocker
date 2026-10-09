export type Label =
  | 'ad'
  | 'cookie_consent'
  | 'signup_modal'
  | 'sticky_video'
  | 'chat_widget'
  | 'social_bar'
  | 'paywall_overlay'
  | 'recommendation_widget'
  | 'main_content'
  | 'site_navigation';

export type Category = Exclude<Label, 'main_content' | 'site_navigation'>;

/** Compact description of a page element, sent to the decision model. */
export interface ElementSummary {
  tag: string;
  role?: string;
  classes?: string;
  text?: string;
  buttons?: string[];
  link_domains?: string[];
  iframe_src?: string;
  position: string;
  z_index?: number;
  locks_scroll?: boolean;
}

/** Layout facts used by the heuristics but not sent to the model. */
export interface Features {
  fixed: boolean;
  sticky: boolean;
  coverage: number;
  zIndex: number;
  locksScroll: boolean;
  adHost: boolean;
  area: number;
}

export interface CandidateInfo {
  summary: ElementSummary;
  features: Features;
}

export type VerdictSource = 'heuristic' | 'model' | 'cache';

export interface Verdict {
  label: Label;
  confidence: number;
}

export interface Settings {
  provider: 'laya' | 'jev';
  laya: { baseUrl: string; model: 'english' | 'typed-decisions' | 'multilingual' };
  jev: { apiKey: string; model: string };
  categories: Record<Category, boolean>;
  cookieMode: 'reject' | 'hide';
  threshold: number;
  networkBlocking: boolean;
  disabledSites: string[];
  debug: boolean;
  cacheTtlDays: number;
}

export type ProviderState = 'online' | 'offline' | 'auth' | 'ratelimited' | 'unknown';

export interface ProviderStatus {
  state: ProviderState;
  message?: string;
  lastLatencyMs?: number;
  calls: number;
}
