import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';

/**
 * Outbound HTTP for user-supplied URLs (link previews).
 *
 * Every resolved address is checked at connect time (not just once before the request),
 * so DNS rebinding and redirects to internal hosts cannot reach private networks,
 * loopback, link-local/cloud metadata, or the WAHA/DB containers.
 */

const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockList.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96], // NAT64
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  // IPv4-mapped addresses (::ffff:a.b.c.d) are matched against the IPv4 rules by BlockList.
  blockList.addSubnet(addr, prefix, 'ipv6');
}

export function isBlockedIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  const family = net.isIP(bare);
  if (family === 4) return blockList.check(bare, 'ipv4');
  if (family === 6) return blockList.check(bare, 'ipv6');
  return true; // not an IP at all: refuse rather than guess
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (net.isIP(h)) return isBlockedIp(h);
  // Single-label names (e.g. "waha", "postgres", "web") resolve to Docker/LAN services.
  if (!h.includes('.')) return true;
  return false;
}

class BlockedAddressError extends Error {
  constructor(address: string) {
    super(`Blocked address ${address}`);
    this.name = 'BlockedAddressError';
  }
}

// Wraps dns.lookup and rejects private addresses at socket connect time.
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, options as dns.LookupAllOptions, (err, addresses: any, family?: number) => {
    if (err) return (callback as any)(err);
    const list: dns.LookupAddress[] = Array.isArray(addresses)
      ? addresses
      : [{ address: addresses, family: family || net.isIP(addresses) }];
    const blocked = list.find((a) => isBlockedIp(a.address));
    if (blocked) return (callback as any)(new BlockedAddressError(blocked.address));
    if (Array.isArray(addresses)) return (callback as any)(null, list);
    return (callback as any)(null, list[0].address, list[0].family);
  });
};

export interface SafeFetchResult {
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
}

export class BlockedUrlError extends Error {}

function requestOnce(
  url: URL,
  headers: Record<string, string>,
  maxBytes: number,
  signal: AbortSignal
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      { method: 'GET', headers, lookup: guardedLookup, signal },
      (res) => {
        const status = res.statusCode || 0;
        const isHtml = String(res.headers['content-type'] || '').includes('text/html');
        if (status >= 300 || !isHtml) {
          res.resume();
          resolve({ status, headers: res.headers, body: '' });
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (body.length >= maxBytes || body.includes('</head>')) {
            res.destroy();
            resolve({ status, headers: res.headers, body: body.slice(0, maxBytes) });
          }
        });
        res.on('end', () => resolve({ status, headers: res.headers, body }));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetchHtml(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; headers?: Record<string, string> } = {}
): Promise<SafeFetchResult> {
  const { timeoutMs = 3500, maxBytes = 65536, maxRedirects = 3, headers = {} } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = new URL(rawUrl);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new BlockedUrlError('Unsupported protocol');
      }
      if (isBlockedHostname(current.hostname)) {
        throw new BlockedUrlError('Blocked host');
      }
      const res = await requestOnce(current, headers, maxBytes, controller.signal);
      const location = res.headers.location;
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      return {
        status: res.status,
        contentType: String(res.headers['content-type'] || ''),
        body: res.body,
        finalUrl: current.toString(),
      };
    }
    throw new BlockedUrlError('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}
