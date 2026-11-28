import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAuthToken,
  AUTH_COOKIE_NAME,
  SESSION_CHECK_PATH,
  SESSION_CHECK_HEADER,
  getSessionCheckKey,
} from '@/lib/auth-token';

const ADMIN_PAGE_PREFIXES = ['/admin', '/overview', '/logs', '/users', '/settings'];

// A JWT stays valid for 7 days, so deactivation and role changes are enforced by asking the
// database (through a Node route) and caching the answer briefly per user.
const SESSION_STATUS_TTL_MS = 15_000;
type SessionStatus = { active: boolean; role: 'ADMIN' | 'OPERATOR' | null };
const sessionStatusCache = new Map<string, { value: SessionStatus; expiresAt: number }>();

function internalBaseUrl(req: NextRequest): string {
  const host = req.nextUrl.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return req.nextUrl.origin;
  }
  return process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`;
}

async function getSessionStatus(req: NextRequest, userId: string): Promise<SessionStatus | null> {
  const cached = sessionStatusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const url = `${internalBaseUrl(req)}${SESSION_CHECK_PATH}?id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: { [SESSION_CHECK_HEADER]: getSessionCheckKey() },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const value = (await res.json()) as SessionStatus;
    if (sessionStatusCache.size > 1000) sessionStatusCache.clear();
    if (value.active) {
      sessionStatusCache.set(userId, { value, expiresAt: Date.now() + SESSION_STATUS_TTL_MS });
    } else {
      // Never cache a rejection: a disabled user's cookie is deleted on the first 401 anyway,
      // and caching it would log the user out again right after an Admin reactivates them.
      sessionStatusCache.delete(userId);
    }
    return value;
  } catch (err) {
    // Database/route unreachable: fall back to the last known answer, else the signed token,
    // so an outage does not lock every operator out.
    console.warn('[Middleware] Session status check failed:', err);
    return cached?.value ?? null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public static assets and system routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/uploads') ||
    pathname.endsWith('.csv') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Allow vital webhook endpoint for WAHA engine without authentication.
  //    The session check route authenticates its caller with the server secret itself.
  if (pathname === '/api/webhook' || pathname === SESSION_CHECK_PATH) {
    return NextResponse.next();
  }

  // 3. Allow public auth endpoints
  if (pathname === '/login' || pathname === '/api/auth/login') {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const user = await verifyAuthToken(token);
      if (user) {
        return NextResponse.redirect(new URL('/inbox', req.url));
      }
    }
    return NextResponse.next();
  }

  // 4. Check auth token for all other routes
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const user = await verifyAuthToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized: Session Expired' }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }

  // Deactivated or deleted accounts lose access within SESSION_STATUS_TTL_MS; the current
  // role in the database wins over the role baked into the token.
  const status = await getSessionStatus(req, user.id);
  if (status && !status.active) {
    const res = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Unauthorized: Account disabled' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }
  const effectiveRole = status?.role || user.role;

  // 5. Admin route protection: only ADMIN role can access admin pages & /api/admin/*
  const isAdminPage = ADMIN_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isAdminPage || pathname.startsWith('/api/admin')) {
    if (effectiveRole !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/inbox', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/webhook|_next/static|_next/image|favicon.ico).*)'],
};
