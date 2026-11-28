import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { SESSION_CHECK_HEADER, getSessionCheckKey } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

function keyMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(getSessionCheckKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Internal endpoint for middleware: is this user still allowed in, and with which role?
 * Not reachable without the server secret, so it cannot be used to enumerate accounts.
 */
export async function GET(req: NextRequest) {
  if (!keyMatches(req.headers.get(SESSION_CHECK_HEADER))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const userId = req.nextUrl.searchParams.get('id') || '';
  if (!userId) {
    return NextResponse.json({ active: false, role: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  });

  return NextResponse.json({
    active: Boolean(user?.isActive),
    role: user?.role ?? null,
  });
}
