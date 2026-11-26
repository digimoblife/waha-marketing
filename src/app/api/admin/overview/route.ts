import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';
import { getWorkspaceSettings } from '@/lib/settings';
import { getSentTodayCount } from '@/lib/broadcast-worker';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export async function GET() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const wibOffset = 7 * 60 * 60 * 1000;

    const [
      settings,
      sentToday,
      messages7d,
      chats,
      users,
      recentLogs,
      errorLogs7d,
      totalContacts,
      activeWAContacts,
      successLogs7d,
    ] = await Promise.all([
      getWorkspaceSettings(),
      getSentTodayCount(),
      prisma.message.findMany({
        where: { timestamp: { gte: sevenDaysAgo } },
        select: { fromMe: true, timestamp: true, chatId: true },
      }),
      prisma.chat.findMany({
        include: {
          contact: { select: { name: true, storeName: true, phone: true } },
          assignee: { select: { id: true, name: true, username: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, username: true, role: true },
        orderBy: { name: 'asc' },
      }),
      prisma.log.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.log.findMany({
        where: { status: 'ERROR', createdAt: { gte: sevenDaysAgo } },
        select: { message: true, error: true, type: true },
      }),
      prisma.contact.count(),
      prisma.contact.count({ where: { isWAUser: true } }),
      prisma.log.count({ where: { status: 'SUCCESS', createdAt: { gte: sevenDaysAgo } } }),
    ]);

    let wahaSession: any = null;
    const pingStart = Date.now();
    try {
      wahaSession = await waha.getSessionStatus();
    } catch (e: any) {
      wahaSession = { status: 'OFFLINE', error: e.message };
    }
    const latencyMs = Date.now() - pingStart;

    // 1. 7-day traffic buckets (WIB)
    const buckets: Array<{ key: string; label: string; out: number; in: number }> = [];
    const bucketMap = new Map<string, { key: string; label: string; out: number; in: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000 + wibOffset);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const item = { key, label: DAY_NAMES[d.getUTCDay()], out: 0, in: 0 };
      buckets.push(item);
      bucketMap.set(key, item);
    }

    let sent7d = 0;
    let received7d = 0;
    const outboundChatIds = new Set<string>();
    const inboundChatIds = new Set<string>();

    for (const m of messages7d) {
      if (m.fromMe) {
        sent7d++;
        outboundChatIds.add(m.chatId);
      } else {
        received7d++;
        inboundChatIds.add(m.chatId);
      }
      const d = new Date(m.timestamp.getTime() + wibOffset);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const b = bucketMap.get(key);
      if (b) {
        if (m.fromMe) b.out++;
        else b.in++;
      }
    }

    let repliedCount = 0;
    outboundChatIds.forEach((cid) => {
      if (inboundChatIds.has(cid)) repliedCount++;
    });
    const responseRate =
      outboundChatIds.size > 0
        ? Math.round((repliedCount / outboundChatIds.size) * 1000) / 10
        : 0;

    const totalOps7d = successLogs7d + errorLogs7d.length;
    const deliverySuccessRate =
      totalOps7d > 0 ? Math.round((successLogs7d / totalOps7d) * 1000) / 10 : 100;

    // 2. Guardrail ratio (outbound : inbound over 7 days)
    const outInRatio =
      received7d > 0 ? Math.round((sent7d / received7d) * 10) / 10 : sent7d > 0 ? sent7d : 0;

    // 3. Operator Workload (live)
    const workload = users.map((u) => {
      const assigned = chats.filter((c) => c.assigneeId === u.id);
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        open: assigned.filter((c) => c.status === 'OPEN').length,
        followUp: assigned.filter((c) => c.status === 'FOLLOW_UP').length,
        resolved: assigned.filter((c) => c.status === 'RESOLVED').length,
        reminders: assigned.filter((c) => Boolean(c.reminderAt)).length,
        total: assigned.length,
      };
    });

    const unassignedChats = chats.filter((c) => !c.assigneeId);
    workload.push({
      id: 'UNASSIGNED',
      name: 'Belum Di-assign',
      username: '-',
      role: 'NONE',
      open: unassignedChats.filter((c) => c.status === 'OPEN').length,
      followUp: unassignedChats.filter((c) => c.status === 'FOLLOW_UP').length,
      resolved: unassignedChats.filter((c) => c.status === 'RESOLVED').length,
      reminders: unassignedChats.filter((c) => Boolean(c.reminderAt)).length,
      total: unassignedChats.length,
    });

    // 4. SLA & Overdue Alert Queue
    const slaMs = settings.slaHours.slaMinutes * 60 * 1000;
    const slaAlerts: Array<{
      chatId: string;
      title: string;
      type: 'UNASSIGNED' | 'OVERDUE' | 'UNREAD_SLA';
      detail: string;
    }> = [];

    for (const c of chats) {
      const title = c.contact?.storeName || c.contact?.name || c.name || c.id;
      if (c.reminderAt && new Date(c.reminderAt).getTime() <= now.getTime()) {
        slaAlerts.push({
          chatId: c.id,
          title,
          type: 'OVERDUE',
          detail: `Pengingat jatuh tempo: ${c.reminderNote || 'Follow up merchant'}`,
        });
      } else if (!c.assigneeId && c.status !== 'RESOLVED') {
        slaAlerts.push({
          chatId: c.id,
          title,
          type: 'UNASSIGNED',
          detail: 'Belum ada PIC operator yang menangani',
        });
      } else if (c.unreadCount > 0) {
        const waitRef = c.lastInboundAt || c.lastMessageAt;
        const waitedMs = waitRef ? now.getTime() - new Date(waitRef).getTime() : 0;
        if (waitedMs >= slaMs || c.unreadCount > 0) {
          const waitedMin = Math.max(1, Math.round(waitedMs / 60000));
          slaAlerts.push({
            chatId: c.id,
            title,
            type: 'UNREAD_SLA',
            detail: `${c.unreadCount} pesan belum dibalas (${waitedMin}m • PIC: ${c.assignee?.name || '-'})`,
          });
        }
      }
    }

    // 5. Funnel Status
    const funnel = {
      open: chats.filter((c) => c.status === 'OPEN').length,
      followUp: chats.filter((c) => c.status === 'FOLLOW_UP').length,
      resolved: chats.filter((c) => c.status === 'RESOLVED').length,
      total: chats.length,
    };

    // 6. Error Breakdown
    let errNotWa = 0;
    let errTimeout = 0;
    let errOther = 0;
    for (const e of errorLogs7d) {
      const txt = `${e.message || ''} ${e.error || ''}`.toLowerCase();
      if (txt.includes('tidak terdaftar') || txt.includes('not exist') || txt.includes('invalid')) {
        errNotWa++;
      } else if (txt.includes('timeout') || txt.includes('fetch') || txt.includes('econn')) {
        errTimeout++;
      } else {
        errOther++;
      }
    }

    return NextResponse.json({
      wahaSession: {
        status: wahaSession?.status || 'OFFLINE',
        me: wahaSession?.me || null,
        latencyMs,
      },
      guardrail: {
        sentToday,
        maxDailyMessages: settings.guardrail.maxDailyMessages,
        minDelaySec: settings.guardrail.minDelaySec,
        outInRatio,
      },
      kpis: {
        sent7d,
        received7d,
        responseRate,
        deliverySuccessRate,
        errorCount7d: errorLogs7d.length,
        slaAlertCount: slaAlerts.length,
        totalContacts,
        activeWAContacts,
      },
      workload,
      slaAlerts: slaAlerts.slice(0, 10),
      traffic7d: buckets,
      funnel,
      errorBreakdown: {
        notWa: errNotWa,
        timeout: errTimeout,
        other: errOther,
      },
      recentLogs,
    });
  } catch (err: any) {
    console.error('Admin overview error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
