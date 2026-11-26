import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, AUTH_COOKIE_NAME } from '@/lib/auth-token';

const ADMIN_PAGE_PREFIXES = ['/admin', '/overview', '/logs', '/users', '/settings'];

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

  // 2. Allow vital webhook endpoint for WAHA engine without authentication
  if (pathname === '/api/webhook') {
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

  // 5. Admin route protection: only ADMIN role can access admin pages & /api/admin/*
  const isAdminPage = ADMIN_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isAdminPage || pathname.startsWith('/api/admin')) {
    if (user.role !== 'ADMIN') {
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
