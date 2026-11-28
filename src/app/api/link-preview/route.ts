import { NextRequest, NextResponse } from 'next/server';
import { isBlockedHostname, safeFetchHtml } from '@/lib/safe-fetch';

export const dynamic = 'force-dynamic';

interface CachedPreview {
  data: {
    url: string;
    hostname: string;
    title: string | null;
    description: string | null;
    image: string | null;
  };
  expiresAt: number;
}

const previewCache = new Map<string, CachedPreview>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractMeta(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const cleaned = decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim();
      if (cleaned) return cleaned;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const rawUrl = req.nextUrl.searchParams.get('url') || '';
    if (!rawUrl) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    if (isBlockedHostname(parsed.hostname)) {
      return NextResponse.json({ error: 'Blocked host' }, { status: 400 });
    }

    const normalizedUrl = parsed.toString();
    const cached = previewCache.get(normalizedUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ preview: cached.data });
    }

    const fallback = {
      url: normalizedUrl,
      hostname: parsed.hostname.replace(/^www\./, ''),
      title: null as string | null,
      description: null as string | null,
      image: null as string | null,
    };

    try {
      const res = await safeFetchHtml(normalizedUrl, {
        timeoutMs: 3500,
        maxBytes: 65536,
        maxRedirects: 3,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LapaqBot/1.0; +https://lapaq.id)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (res.status >= 200 && res.status < 300 && res.contentType.includes('text/html')) {
        const html = res.body;

        const title = extractMeta(html, [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
          /<title[^>]*>([^<]+)<\/title>/i,
        ]);

        const description = extractMeta(html, [
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
        ]);

        let image = extractMeta(html, [
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        ]);

        if (image) {
          try {
            image = new URL(image, res.finalUrl).toString();
          } catch {
            image = null;
          }
        }

        fallback.title = title ? title.slice(0, 140) : null;
        fallback.description = description ? description.slice(0, 220) : null;
        fallback.image = image;
      }
    } catch {
      // Blocked, unreachable, or timed out: fall back gracefully to the hostname card
    }

    if (previewCache.size > 200) {
      const oldestKey = previewCache.keys().next().value;
      if (oldestKey) previewCache.delete(oldestKey);
    }
    previewCache.set(normalizedUrl, {
      data: fallback,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json({ preview: fallback });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
