export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** True when `host` equals a disabled site or is one of its subdomains. */
export function isSiteDisabled(host: string, disabledSites: string[]): boolean {
  return disabledSites.some((site) => host === site || host.endsWith(`.${site}`));
}
