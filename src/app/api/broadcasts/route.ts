import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, phoneToJid } from '@/lib/phone';
import { getRequestUser } from '@/lib/session-user';
import { getWorkspaceSettings } from '@/lib/settings';
import { triggerBroadcastWorker, getSentTodayCount } from '@/lib/broadcast-worker';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const campaigns = await prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        recipients: {
          orderBy: { id: 'asc' },
          take: 200,
        },
      },
    });

    const sentToday = await getSentTodayCount();
    const settings = await getWorkspaceSettings();

    return NextResponse.json({
      campaigns,
      quota: {
        sentToday,
        maxDailyMessages: settings.guardrail.maxDailyMessages,
        minDelaySec: settings.guardrail.minDelaySec,
        maxRecipientsPerCampaign: settings.guardrail.maxRecipientsPerCampaign,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const messageBody = String(body.messageBody || '').trim();
    const templateId = body.templateId ? String(body.templateId) : null;
    const startNow = body.startNow !== false;
    const rawRecipients: Array<{
      phone: string;
      contactId?: string | null;
      storeName?: string | null;
      contactName?: string | null;
      businessCategory?: string | null;
    }> = Array.isArray(body.recipients) ? body.recipients : [];

    if (!name || !messageBody) {
      return NextResponse.json(
        { error: 'Nama campaign dan isi pesan wajib diisi' },
        { status: 400 }
      );
    }

    if (rawRecipients.length === 0) {
      return NextResponse.json(
        { error: 'Pilih minimal 1 nomor penerima WhatsApp' },
        { status: 400 }
      );
    }

    const settings = await getWorkspaceSettings();
    const sentToday = await getSentTodayCount();

    // Deduplicate and sanitize recipient numbers
    const uniqueMap = new Map<string, (typeof rawRecipients)[number] & { cleanPhone: string; jid: string }>();
    for (const r of rawRecipients) {
      const cleanPhone = sanitizePhone(r.phone || '');
      if (!cleanPhone || cleanPhone.length < 8) continue;
      if (!uniqueMap.has(cleanPhone)) {
        uniqueMap.set(cleanPhone, {
          ...r,
          cleanPhone,
          jid: phoneToJid(cleanPhone),
        });
      }
    }

    const recipients = Array.from(uniqueMap.values());
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Tidak ada nomor telepon yang valid' }, { status: 400 });
    }

    if (recipients.length > settings.guardrail.maxRecipientsPerCampaign) {
      return NextResponse.json(
        {
          error: `Maksimal penerima per campaign adalah ${settings.guardrail.maxRecipientsPerCampaign} nomor (sesuai guardrail Admin).`,
        },
        { status: 400 }
      );
    }

    if (sentToday >= settings.guardrail.maxDailyMessages) {
      return NextResponse.json(
        {
          error: `Kuota pesan harian (${sentToday}/${settings.guardrail.maxDailyMessages}) sudah tercapai. Ubah di Pengaturan Admin jika perlu.`,
        },
        { status: 400 }
      );
    }

    const requestedMin = Number(body.delayMinSec) || settings.guardrail.minDelaySec;
    const requestedMax = Number(body.delayMaxSec) || requestedMin + 10;
    const delayMinSec = Math.max(requestedMin, settings.guardrail.minDelaySec);
    const delayMaxSec = Math.max(requestedMax, delayMinSec + 2);

    const user = await getRequestUser(req);

    const enableAiFollowup = Boolean(body.enableAiFollowup);
    const campaignGoal = body.campaignGoal
      ? String(body.campaignGoal).trim().slice(0, 300)
      : null;

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name,
        templateId,
        messageBody,
        delayMinSec,
        delayMaxSec,
        status: startNow ? 'RUNNING' : 'DRAFT',
        enableAiFollowup,
        campaignGoal,
        totalCount: recipients.length,
        createdById: user?.id || null,
        createdByName: user?.name || user?.username || 'Operator',
        recipients: {
          create: recipients.map((r) => ({
            phone: r.cleanPhone,
            jid: r.jid,
            contactId: r.contactId || null,
            storeName: r.storeName || null,
            contactName: r.contactName || null,
            businessCategory: r.businessCategory || null,
            status: 'QUEUED',
          })),
        },
      },
      include: {
        recipients: true,
      },
    });

    await createLog(
      'BROADCAST',
      'SUCCESS',
      `Campaign "${campaign.name}" dibuat oleh ${campaign.createdByName} (${recipients.length} penerima, delay ${delayMinSec}-${delayMaxSec}s)`
    );

    if (startNow) {
      triggerBroadcastWorker(campaign.id);
    }

    return NextResponse.json({ ok: true, campaign });
  } catch (err: any) {
    console.error('Create broadcast error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
