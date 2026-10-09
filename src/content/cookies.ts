const CLICKABLE = 'button, [role="button"], a, input[type="button"], input[type="submit"]';

/** Strongest first. Each pattern is matched against the whole, trimmed button label. */
const REJECT_PATTERNS: RegExp[] = [
  /\b(reject|decline|refuse|deny) all\b|\btout refuser\b|\balle ablehnen\b|\brechazar todo\b|\brifiuta tutt[io]\b/i,
  /\b(only|strictly) (necessary|essential|required)\b|\b(necessary|essential|required)( cookies)? only\b|\bnur notwendige\b|\buniquement (les )?(cookies )?n[ée]cessaires\b/i,
  /^(reject|decline|refuse|deny|disagree|ablehnen|refuser|rechazar|rifiuta|weigeren|avvisa|odrzuć)\b/i,
  /\b(reject|decline|refuse)\b|\bcontinue without accepting\b|\bdo not (accept|consent)\b/i,
];

/** Labels that consent to tracking. A button matching these is never clicked unless it is "necessary only" wording. */
const ACCEPT = /\b(accept|agree|allow|akzeptieren|zustimmen|accepter|aceptar|accetta|got it|ok|okay|continue)\b/i;
const NECESSARY_ONLY = REJECT_PATTERNS[1];

function label(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text || (el as HTMLInputElement).value?.trim() || el.getAttribute('aria-label')?.trim() || '';
}

/** The button inside a consent banner that refuses optional cookies, or null. Never an accept button. */
export function findRejectButton(banner: Element): HTMLElement | null {
  const options = [...banner.querySelectorAll(CLICKABLE)]
    .map((el) => ({ el: el as HTMLElement, text: label(el) }))
    .filter(({ text }) => text.length > 0 && text.length <= 60)
    .filter(({ text }) => !ACCEPT.test(text) || NECESSARY_ONLY.test(text));
  for (const pattern of REJECT_PATTERNS) {
    const hit = options.find(({ text }) => pattern.test(text));
    if (hit) return hit.el;
  }
  return null;
}
