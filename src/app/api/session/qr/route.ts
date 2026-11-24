import { NextResponse } from 'next/server';
import { waha } from '@/lib/waha';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = process.env.WAHA_SESSION || 'default';
    const apiKey = process.env.WAHA_API_KEY || 'waha_marketing_secret_key';

    const res = await fetch(`${waha.baseUrl}/api/${session}/auth/qr`, {
      headers: {
        'x-api-key': apiKey,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new NextResponse('QR code belum siap', { status: 404 });
    }

    const imageBuffer = await res.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}
