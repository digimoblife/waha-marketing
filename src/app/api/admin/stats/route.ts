import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      totalMessages,
      totalSent,
      totalReceived,
      totalMedia,
      totalContacts,
      totalChats,
      totalUsers,
      totalMerchants,
      recentLogs,
      successCount,
      errorCount,
    ] = await Promise.all([
      prisma.message.count(),
      prisma.message.count({ where: { fromMe: true } }),
      prisma.message.count({ where: { fromMe: false } }),
      prisma.message.count({ where: { mediaType: { not: 'text' } } }),
      prisma.contact.count(),
      prisma.chat.count(),
      prisma.user.count(),
      prisma.contact.count({
        where: {
          OR: [
            { storeName: { not: null } },
            { businessCategory: { not: null } },
          ],
        },
      }),
      prisma.log.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.log.count({ where: { status: 'SUCCESS' } }),
      prisma.log.count({ where: { status: 'ERROR' } }),
    ]);

    let wahaSession = null;
    try {
      wahaSession = await waha.getSessionStatus();
    } catch (e: any) {
      wahaSession = { status: 'OFFLINE', error: e.message };
    }

    return NextResponse.json({
      stats: {
        totalMessages,
        totalSent,
        totalReceived,
        totalMedia,
        totalContacts,
        totalChats,
        totalUsers,
        totalMerchants,
        successCount,
        errorCount,
      },
      wahaSession,
      recentLogs,
    });
  } catch (err: any) {
    console.error('Stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
