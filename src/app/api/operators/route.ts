import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Lightweight list of active operators/admins for Inbox PIC assignment
export async function GET() {
  try {
    const operators = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ operators });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
