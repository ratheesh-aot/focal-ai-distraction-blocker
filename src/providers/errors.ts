export type ProviderErrorKind = 'network' | 'timeout' | 'auth' | 'ratelimit' | 'bad_response' | 'http';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function errorForStatus(status: number, body: string): ProviderError {
  const detail = body.slice(0, 200);
  if (status === 401 || status === 403) return new ProviderError('auth', `Not authorised (${status}) ${detail}`, status);
  if (status === 402 || status === 429) return new ProviderError('ratelimit', `Rate limited or out of credit (${status}) ${detail}`, status);
  return new ProviderError('http', `HTTP ${status} ${detail}`, status);
}

/** fetch + timeout + JSON, mapping every failure to a ProviderError. */
export async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new ProviderError('timeout', `No response from ${url} within ${timeoutMs} ms`);
    throw new ProviderError('network', `Cannot reach ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw errorForStatus(res.status, await res.text().catch(() => ''));
  try {
    return await res.json();
  } catch {
    throw new ProviderError('bad_response', `Response from ${url} is not JSON`);
  }
}
