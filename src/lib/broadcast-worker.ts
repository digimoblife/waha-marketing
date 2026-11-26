import { prisma } from './prisma';
import { waha } from './waha';
import { createLog } from './logger';
import { getWorkspaceSettings } from './settings';
import { interpolateTemplate } from './template-utils';
import { markMessageProcessed } from './msg-cache';

const globalForWorker = globalThis as unknown as {
  activeBroadcastCampaigns?: Set<string>;
};

if (!globalForWorker.activeBroadcastCampaigns) {
  globalForWorker.activeBroadcastCampaigns = new Set<string>();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minSec: number, maxSec: number) {
  const safeMin = Math.max(1, minSec);
  const safeMax = Math.max(safeMin, maxSec);
  const sec = safeMin + Math.random() * (safeMax - safeMin);
  return Math.round(sec * 1000);
}

/**
 * Count outgoing messages sent since 00:00 WIB today
 */
export async function getSentTodayCount(): Promise<number> {
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now.getTime() + wibOffset);
  const wibStart = new Date(
    Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - wibOffset
  );

  return await prisma.message.count({
    where: {
      fromMe: true,
      timestamp: { gte: wibStart },
    },
  });
}

/**
 * Fire-and-forget campaign runner with DB-backed pause/cancel, daily guardrail, and circuit breaker.
 */
export function triggerBroadcastWorker(campaignId: string) {
  const activeSet = globalForWorker.activeBroadcastCampaigns!;
  if (activeSet.has(campaignId)) return;

  activeSet.add(campaignId);
  runBroadcastLoop(campaignId)
    .catch((err) => {
      console.error(`[BroadcastWorker] Campaign ${campaignId} crashed:`, err);
    })
    .finally(() => {
      activeSet.delete(campaignId);
    });
}

async function runBroadcastLoop(campaignId: string) {
  let consecutiveErrors = 0;

  while (true) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status !== 'RUNNING') {
      break;
    }

    const nextRecipient = await prisma.broadcastRecipient.findFirst({
      where: { campaignId, status: 'QUEUED' },
      orderBy: { id: 'asc' },
    });

    if (!nextRecipient) {
      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await createLog(
        'BROADCAST',
        'SUCCESS',
        `Campaign "${campaign.name}" selesai: ${campaign.sentCount} terkirim, ${campaign.failedCount} gagal`
      );
      break;
    }

    // Check daily guardrail quota before sending
    const settings = await getWorkspaceSettings();
    const sentToday = await getSentTodayCount();
    if (sentToday >= settings.guardrail.maxDailyMessages) {
      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: 'PAUSED' },
      });
      await createLog(
        'BROADCAST',
        'WARNING',
        `Campaign "${campaign.name}" otomatis dijeda: kuota harian (${sentToday}/${settings.guardrail.maxDailyMessages}) tercapai`
      );
      break;
    }

    // Interpolate message per recipient
    const personalizedText = interpolateTemplate(campaign.messageBody, {
      name: nextRecipient.contactName,
      storeName: nextRecipient.storeName,
      category: nextRecipient.businessCategory,
    });

    try {
      const wahaRes = await waha.sendText(nextRecipient.jid, personalizedText);
      if (wahaRes?.error || wahaRes?.statusCode >= 400) {
        throw new Error(wahaRes?.message || wahaRes?.error || 'WAHA menolak pengiriman');
      }

      const timestamp = new Date();
      const rawId = wahaRes?.id || wahaRes?.key?.id || `bc_${campaignId}_${nextRecipient.id}`;
      const msgId = typeof rawId === 'string' ? rawId : rawId?._serialized || `bc_${Date.now()}`;
      markMessageProcessed(msgId);

      // Ensure Chat exists and store Message so history appears in Inbox
      await prisma.chat.upsert({
        where: { id: nextRecipient.jid },
        create: {
          id: nextRecipient.jid,
          name: nextRecipient.contactName || nextRecipient.storeName || nextRecipient.phone,
          lastMessage: personalizedText,
          lastMessageAt: timestamp,
          unreadCount: 0,
          contactId: nextRecipient.contactId || null,
        },
        update: {
          lastMessage: personalizedText,
          lastMessageAt: timestamp,
        },
      });

      await prisma.message
        .create({
          data: {
            id: msgId,
            chatId: nextRecipient.jid,
            contactId: nextRecipient.contactId || null,
            fromMe: true,
            body: personalizedText,
            mediaType: 'text',
            ackStatus: 1,
            timestamp,
          },
        })
        .catch(() => null);

      await prisma.$transaction([
        prisma.broadcastRecipient.update({
          where: { id: nextRecipient.id },
          data: { status: 'SENT', sentAt: timestamp, error: null },
        }),
        prisma.broadcastCampaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        }),
      ]);

      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors++;
      const errMsg = err?.message || 'Gagal mengirim pesan';

      await prisma.$transaction([
        prisma.broadcastRecipient.update({
          where: { id: nextRecipient.id },
          data: { status: 'FAILED', error: errMsg },
        }),
        prisma.broadcastCampaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
        }),
      ]);

      await createLog(
        'BROADCAST',
        'ERROR',
        `Gagal broadcast ke ${nextRecipient.phone} (${campaign.name}): ${errMsg}`,
        { campaignId, recipientId: nextRecipient.id },
        errMsg
      );

      // Circuit breaker check
      if (consecutiveErrors >= settings.guardrail.circuitBreakerErrors) {
        await prisma.broadcastCampaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED' },
        });
        await createLog(
          'BROADCAST',
          'WARNING',
          `Circuit breaker aktif pada "${campaign.name}": ${consecutiveErrors} error berturut-turut, antrean otomatis dijeda`
        );
        break;
      }
    }

    // Wait anti-ban delay respecting admin minimum delay
    const minSec = Math.max(campaign.delayMinSec, settings.guardrail.minDelaySec);
    const maxSec = Math.max(campaign.delayMaxSec, minSec + 2);
    const delayMs = randomDelayMs(minSec, maxSec);

    // Sleep in 1s chunks so PAUSE/CANCEL reacts quickly
    let elapsed = 0;
    while (elapsed < delayMs) {
      const step = Math.min(1000, delayMs - elapsed);
      await sleep(step);
      elapsed += step;
      const check = await prisma.broadcastCampaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (!check || check.status !== 'RUNNING') {
        return;
      }
    }
  }
}
