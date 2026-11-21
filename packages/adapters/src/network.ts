import { timeline } from '@rn-perf-kit/core';

type Tracked = XMLHttpRequest & { __perf?: { url: string; method: string } };
// Deliberately loose: apps that compile this source see two different XMLHttpRequest
// declarations (lib.dom and React Native's globals), and assigning one `open`
// signature to the other fails to type-check in the consuming app.
type XhrMethod = (this: Tracked, ...args: any[]) => any;
type XhrProto = { open: XhrMethod; send: XhrMethod };
let origOpen: XhrMethod | null = null;
let origSend: XhrMethod | null = null;
let ourOpen: XhrMethod | null = null;
let ourSend: XhrMethod | null = null;
let active = false;

export function installNetworkInterceptor(): void {
  const proto = (globalThis as any).XMLHttpRequest?.prototype as XhrProto | undefined;
  if (!proto) return;
  active = true;
  if (origOpen) return; // already patched; `active` turns recording back on

  origOpen = proto.open;
  origSend = proto.send;

  ourOpen = function (this: Tracked, method: string, url: string | URL, ...rest: any[]) {
    this.__perf = { method, url: redactUrl(String(url)) };
    return origOpen!.call(this, method, url, ...rest);
  };

  ourSend = function (this: Tracked, body?: any) {
    const meta = this.__perf;
    if (meta && active) {
      const t = timeline.now();
      this.addEventListener('loadend', () => {
        timeline.add({
          type: 'net',
          t,
          dur: timeline.now() - t,
          url: meta.url,
          status: this.status,
          bytes: responseSize(this),
        });
      });
    }
    return origSend!.call(this, body);
  };

  proto.open = ourOpen;
  proto.send = ourSend;
}

export function uninstallNetworkInterceptor(): void {
  active = false;
  const proto = (globalThis as any).XMLHttpRequest?.prototype as XhrProto | undefined;
  if (proto && origOpen && origSend && proto.open === ourOpen && proto.send === ourSend) {
    proto.open = origOpen;
    proto.send = origSend;
    origOpen = origSend = ourOpen = ourSend = null;
  }
}

function responseSize(xhr: XMLHttpRequest): number {
  const len = Number(xhr.getResponseHeader('content-length'));
  if (len > 0) return len;
  try {
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      return xhr.responseText.length;
    }
  } catch {}
  return 0;
}

// Path segments that look like personal data or record ids: long numbers (phone numbers,
// account ids), UUIDs, long hex/base64 tokens, emails.
const SENSITIVE_SEGMENT =
  /^(\+?\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,}|[^@/]+@[^@/]+)$/i;

export function redactUrl(url: string): string {
  const [beforeHash] = url.split('#');
  const [base, query] = beforeHash.split('?');
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i.exec(base)!;
  const origin = m[1] ?? '';
  const path = m[2]
    .split('/')
    .map((seg) => (SENSITIVE_SEGMENT.test(decodeSegment(seg)) ? ':id' : seg))
    .join('/');
  return origin + path + (query !== undefined ? '?[redacted]' : '');
}

function decodeSegment(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
