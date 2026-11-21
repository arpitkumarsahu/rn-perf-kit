/**
 * fetch interceptor for rn-perf-kit.
 * Records network events on the timeline.
 */
import { timeline } from '@rn-perf-kit/core';

const originalFetch = global.fetch;
let installed = false;

export function installFetchInterceptor(): void {
  if (installed || !originalFetch) return;
  installed = true;
  global.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const t = timeline.now();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;
    const redacted = redactUrl(url);
    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (err) {
      timeline.add({ type: 'net', t, dur: timeline.now() - t, url: redacted, bytes: 0, status: 0 });
      throw err;
    }
    const dur = timeline.now() - t;
    const bytes = Number(response.headers.get('content-length') ?? 0);
    timeline.add({ type: 'net', t, dur, url: redacted, bytes, status: response.status });
    return response;
  };
}

export function uninstallFetchInterceptor(): void {
  if (!installed) return;
  global.fetch = originalFetch;
  installed = false;
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = u.search ? '?[redacted]' : '';
    return u.toString();
  } catch {
    return url.split('?')[0];
  }
}
