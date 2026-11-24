import { NextRequest, NextResponse } from 'next/server';
import { waha } from '@/lib/waha';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await waha.getSessionStatus();
    return NextResponse.json({
      status: status?.status || 'OFFLINE',
      session: status || null,
      hasQR: status?.status === 'SCAN_QR_CODE' || status?.status === 'STARTING',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, status: 'OFFLINE' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';

    if (action === 'start' || action === 'restart') {
      // Use restartSession so that if the session was FAILED or STOPPED, it clears it and creates a fresh QR!
      const res = await waha.restartSession();
      return NextResponse.json(res);
    }

    if (action === 'logout') {
      // 1. Logout from WAHA
      try {
        await waha.logoutSession();
      } catch {}

      // 2. Optional: reset database if requested by user
      if (body.resetDb) {
        await prisma.message.deleteMany();
        await prisma.chat.deleteMany();
      }

      // 3. Immediately restart session so fresh QR code is generated for new number
      const restartRes = await waha.restartSession();

      return NextResponse.json({ ok: true, restart: restartRes });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
