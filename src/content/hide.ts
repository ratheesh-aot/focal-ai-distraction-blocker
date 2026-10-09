import type { Category, Label, VerdictSource } from '../shared/types';

export interface HideRecord {
  label: Label;
  confidence: number;
  source: VerdictSource;
}

export interface HideStats {
  hidden: number;
  byCategory: Partial<Record<Category, number>>;
  bySource: Partial<Record<VerdictSource, number>>;
}

const BASE_CSS = `
[data-adb-hidden]{display:none!important}
html.adb-show [data-adb-hidden]{display:revert!important;outline:3px dashed #e8590c!important;outline-offset:-3px}
[data-adb-debug]{outline:3px solid #e8590c!important;outline-offset:-3px}
html.adb-unlock,html.adb-unlock body{overflow:auto!important}
html.adb-unlock body{position:static!important}
`;

function validSelector(doc: Document, sel: string): boolean {
  try {
    doc.querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

/** Hides elements with CSS (never removes them), and can undo everything. */
export class Hider {
  private hidden = new Map<Element, HideRecord>();

  constructor(
    private readonly doc: Document,
    private readonly opts: { debug: boolean },
  ) {}

  private style(id: string): HTMLStyleElement {
    let el = this.doc.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = this.doc.createElement('style');
      el.id = id;
      (this.doc.head ?? this.doc.documentElement).appendChild(el);
    }
    return el;
  }

  private ensureBase(): void {
    const el = this.style('adb-style');
    if (!el.textContent) el.textContent = BASE_CSS;
  }

  hide(el: Element, rec: HideRecord): void {
    if (this.hidden.has(el)) return;
    this.ensureBase();
    this.hidden.set(el, rec);
    if (this.opts.debug) {
      el.setAttribute('data-adb-debug', `${rec.label} ${rec.confidence.toFixed(2)} (${rec.source})`);
      el.setAttribute('title', `AI Distraction Blocker: ${rec.label} ${rec.confidence.toFixed(2)} (${rec.source})`);
    } else {
      el.setAttribute('data-adb-hidden', rec.label);
    }
  }

  isHidden(el: Element): boolean {
    for (const h of this.hidden.keys()) if (h === el || h.contains(el)) return true;
    return false;
  }

  unlockScroll(): void {
    if (this.opts.debug) return;
    this.ensureBase();
    this.doc.documentElement.classList.add('adb-unlock');
  }

  /** Pre-hides elements judged on earlier visits, before they paint. */
  injectSelectors(selectors: string[]): void {
    if (this.opts.debug) return;
    const valid = selectors.filter((s) => validSelector(this.doc, s));
    if (valid.length === 0) return;
    this.style('adb-cached').textContent = valid.map((s) => `${s}{display:none!important}`).join('\n');
  }

  showHidden(on: boolean): void {
    this.ensureBase();
    this.doc.documentElement.classList.toggle('adb-show', on);
    const cached = this.doc.getElementById('adb-cached') as HTMLStyleElement | null;
    if (cached) cached.disabled = on;
  }

  undoAll(): void {
    for (const el of this.hidden.keys()) {
      el.removeAttribute('data-adb-hidden');
      el.removeAttribute('data-adb-debug');
    }
    this.hidden.clear();
    this.doc.getElementById('adb-cached')?.remove();
    this.doc.documentElement.classList.remove('adb-unlock', 'adb-show');
  }

  stats(): HideStats {
    const out: HideStats = { hidden: 0, byCategory: {}, bySource: {} };
    for (const r of this.hidden.values()) {
      out.hidden++;
      const cat = r.label as Category;
      out.byCategory[cat] = (out.byCategory[cat] ?? 0) + 1;
      out.bySource[r.source] = (out.bySource[r.source] ?? 0) + 1;
    }
    return out;
  }
}

const IDENT = /^-?[A-Za-z_][\w-]*$/;
const GENERATED = /\d{3,}|[0-9a-f]{6,}/i;

/** A selector matching exactly this element, readable enough to survive a reload; null if none. */
export function stableSelector(el: Element): string | null {
  const doc = el.ownerDocument;
  const unique = (sel: string) => {
    try {
      const all = doc.querySelectorAll(sel);
      return all.length === 1 && all[0] === el;
    } catch {
      return false;
    }
  };
  if (el.id && IDENT.test(el.id) && !GENERATED.test(el.id) && unique(`#${el.id}`)) return `#${el.id}`;
  const classes = [...el.classList].filter((c) => IDENT.test(c) && !/\d/.test(c)).slice(0, 3);
  if (classes.length === 0) return null;
  const sel = `${el.tagName.toLowerCase()}.${classes.join('.')}`;
  return unique(sel) ? sel : null;
}
