export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** True when `host` equals a disabled site or is one of its subdomains. */
export function isSiteDisabled(host: string, disabledSites: string[]): boolean {
  return disabledSites.some((site) => host === site || host.endsWith(`.${site}`));
}
