import domains from './adDomains.json';

export const AD_DOMAINS: string[] = domains;
const SET = new Set(AD_DOMAINS);

/** True when `host` is a listed ad domain or one of its subdomains. */
export function isAdHost(host: string): boolean {
  let h = host.toLowerCase();
  while (h) {
    if (SET.has(h)) return true;
    const dot = h.indexOf('.');
    if (dot < 0) return false;
    h = h.slice(dot + 1);
  }
  return false;
}
