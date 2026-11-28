import { NextRequest, NextResponse } from 'next/server';
import { fetchPassiveMerchants } from '@/lib/agent/lapaq-bridge';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const minDays = Math.max(1, Math.min(90, Number(url.searchParams.get('minDays')) || 3));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));

    const result = await fetchPassiveMerchants(minDays, limit);
    return NextResponse.json({
      ok: true,
      source: result.source,
      merchants: result.merchants,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal memuat daftar merchant pasif' },
      { status: 500 }
    );
  }
}
