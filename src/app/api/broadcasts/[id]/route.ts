import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { triggerBroadcastWorker } from '@/lib/broadcast-worker';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: params.id },
      include: {
        recipients: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = String(body.action || '').toLowerCase();

    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: params.id },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign tidak ditemukan' }, { status: 404 });
    }

    if (action === 'pause') {
      const updated = await prisma.broadcastCampaign.update({
        where: { id: params.id },
        data: { status: 'PAUSED' },
      });
      return NextResponse.json({ ok: true, campaign: updated });
    }

    if (action === 'resume' || action === 'start') {
      const updated = await prisma.broadcastCampaign.update({
        where: { id: params.id },
        data: { status: 'RUNNING' },
      });
      triggerBroadcastWorker(params.id);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    if (action === 'cancel') {
      const updated = await prisma.broadcastCampaign.update({
        where: { id: params.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      return NextResponse.json({ ok: true, campaign: updated });
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
