import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, isLid, normalizeJid, jidToPhone } from '@/lib/phone';
import { resolveLidToPhone } from '@/lib/lid';
import { createLog } from '@/lib/logger';
import { isMessageProcessed, markMessageProcessed, extractStanzaId } from '@/lib/msg-cache';
import { detectMediaType, downloadWahaMedia, isWahaInternalMediaUrl } from '@/lib/waha-media';
import { getWorkspaceSettings, isOutsideWorkingHours } from '@/lib/settings';
import { waha } from '@/lib/waha';

/**
 * WAHA Webhook Handler
 * Receives events from WAHA container:
 * - 'message' / 'message.any' (incoming & outgoing messages)
 * - 'message.ack' (sent/delivered/read receipt)
 * - 'session.status' (connection updates)
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const event = payload.event;
    const data = payload.payload;

    if (!event || !data) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    console.log(`[Webhook] Received event: ${event}, fromMe: ${data?.fromMe}, from: ${data?.from}, to: ${data?.to}`);

    // 1. Handle incoming / outgoing message
    if (event === 'message' || event === 'message.any') {
      const msgId = data.id;
      if (!msgId) {
        return NextResponse.json({ ok: true, ignored: 'no_id' });
      }

      const stanzaId = data._data?.key?.id || data.key?.id || extractStanzaId(msgId);

      // Fast in-memory deduplication: if this msgId or stanzaId is already being processed, discard immediately
      if (isMessageProcessed(msgId) || (stanzaId && isMessageProcessed(stanzaId))) {
        console.log(`[Webhook] Concurrent duplicate ignored in-memory for msgId: ${msgId}, stanzaId: ${stanzaId}`);
        return NextResponse.json({ ok: true, ignored: 'duplicate_in_memory' });
      }
      markMessageProcessed(msgId);
      if (stanzaId) markMessageProcessed(stanzaId);

      const fromMe = Boolean(data.fromMe);
      let rawChatId =
        (fromMe
          ? (data.to || data._data?.key?.remoteJid || data.from)
          : (data.from || data._data?.key?.remoteJid)) || '';

      if (!rawChatId) {
        console.warn('[Webhook] Could not determine chatId from payload:', data);
        return NextResponse.json({ ok: true, ignored: 'no_chat_id' });
      }

      // Immediately normalize rawChatId from @s.whatsapp.net to canonical @c.us
      rawChatId = normalizeJid(rawChatId);

      // Check if this rawChatId is a LID that can be resolved to phone via Baileys reverse mapping
      let resolvedPhone: string | null = null;
      if (isLid(rawChatId)) {
        resolvedPhone = resolveLidToPhone(rawChatId);
      }

      const canonicalPhone = jidToPhone(rawChatId);
      const canonicalJid = isLid(rawChatId)
        ? rawChatId
        : rawChatId.endsWith('@g.us')
        ? rawChatId
        : `${canonicalPhone}@c.us`;

      // Check if this rawChatId is already mapped to a contact!
      let mappedContact = await prisma.contact.findFirst({
        where: {
          OR: [
            { jid: canonicalJid },
            { jid: rawChatId },
            { phone: canonicalPhone },
            { lid: rawChatId },
            ...(resolvedPhone ? [{ phone: resolvedPhone }, { jid: `${resolvedPhone}@c.us` }] : []),
          ],
        },
      });

      // If mappedContact's stored jid ends with @s.whatsapp.net, heal it to canonicalJid
      if (mappedContact && mappedContact.jid.endsWith('@s.whatsapp.net')) {
        try {
          mappedContact = await prisma.contact.update({
            where: { id: mappedContact.id },
            data: { jid: canonicalJid },
          });
        } catch (e) {
          console.warn('[Webhook] Could not update contact JID from @s.whatsapp.net to @c.us:', e);
        }
      }

      // If mappedContact exists and this is a LID, ensure the contact's lid field is saved
      if (mappedContact && isLid(rawChatId) && !mappedContact.lid) {
        try {
          mappedContact = await prisma.contact.update({
            where: { id: mappedContact.id },
            data: { lid: rawChatId },
          });
        } catch (e) {
          console.warn('[Webhook] Could not link LID to contact:', e);
        }
      }

      // If there was an old temporary chat / contact created for this LID before it was resolved, migrate it
      if (mappedContact && isLid(rawChatId) && rawChatId !== mappedContact.jid) {
        try {
          await prisma.message.updateMany({
            where: { chatId: rawChatId },
            data: { chatId: mappedContact.jid, contactId: mappedContact.id },
          });
          await prisma.chat.deleteMany({
            where: { id: rawChatId },
          });
        } catch (e) {
          // ignore cleanup errors
        }
      }

      // Canonical chat ID: use mapped contact's JID (normalized), or resolved phone JID, or fallback to canonicalJid
      const chatId = mappedContact
        ? normalizeJid(mappedContact.jid)
        : (resolvedPhone ? `${resolvedPhone}@c.us` : canonicalJid);

      // Auto-migrate any stray messages that were logged under @s.whatsapp.net for this number
      if (chatId.endsWith('@c.us')) {
        const straySNetId = `${canonicalPhone}@s.whatsapp.net`;
        await prisma.message.updateMany({
          where: { chatId: straySNetId },
          data: { chatId },
        }).catch(() => null);
        await prisma.chat.deleteMany({
          where: { id: straySNetId },
        }).catch(() => null);
      }

      const text = data.body || (data._data && data._data.body) || '';

      // Media detection & local persistence (needed early for captionless media dedup)
      const rawMediaUrl = data.mediaUrl || data._data?.mediaUrl || data.media?.url || null;
      const fileName = data.filename || data._data?.filename || data.media?.filename || null;
      const mediaType = detectMediaType(data, rawMediaUrl, fileName);

      // Database check: verify if message already exists by msgId OR stanzaId OR serializedId
      const safeStanza = stanzaId && stanzaId.length >= 8 ? stanzaId : '';
      const existingMsg = await prisma.message.findFirst({
        where: {
          OR: [
            { id: msgId },
            ...(safeStanza ? [
              { id: safeStanza },
              { id: { endsWith: safeStanza } },
              { id: `true_${chatId}_${safeStanza}` },
              { id: `false_${chatId}_${safeStanza}` },
            ] : []),
          ],
        },
      });
      if (existingMsg) {
        console.log(`[Webhook] Duplicate message ignored (already in DB: ${existingMsg.id})`);
        return NextResponse.json({ ok: true, ignored: 'already_exists_in_db' });
      }

      // Outgoing message deduplication: If sent from our web UI in the last 15 seconds, avoid double-entry
      if (fromMe) {
        const recentDuplicate = text
          ? await prisma.message.findFirst({
              where: {
                chatId,
                fromMe: true,
                body: text,
                timestamp: { gte: new Date(Date.now() - 15000) },
              },
            })
          : mediaType !== 'text'
          ? await prisma.message.findFirst({
              where: {
                chatId,
                fromMe: true,
                mediaType,
                timestamp: { gte: new Date(Date.now() - 15000) },
              },
            })
          : null;

        if (recentDuplicate) {
          console.log(`[Webhook] Outgoing message already recorded for chatId ${chatId}`);
          return NextResponse.json({ ok: true, ignored: 'recent_outgoing_duplicate' });
        }
      }

      // Look for real sender / pushName in all possible WAHA fields
      const pushName =
        data.pushName ||
        data._data?.notifyName ||
        data._data?.pushName ||
        data._data?.verifiedName ||
        null;

      const rawPhone = (resolvedPhone || chatId).replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
      const phone = isLid(chatId) ? rawPhone : sanitizePhone(rawPhone);
      
      // Local persistence for WAHA internal media URL
      let mediaUrl = rawMediaUrl;
      if (rawMediaUrl && isWahaInternalMediaUrl(rawMediaUrl)) {
        const localUrl = await downloadWahaMedia(rawMediaUrl);
        if (localUrl) {
          mediaUrl = localUrl;
        }
      }

      const timestamp = data.timestamp ? new Date(data.timestamp * 1000) : new Date();

      // Extract Reply / Quoted Context
      const quotedMsgId =
        data.replyTo?.id ||
        data._data?.contextInfo?.stanzaId ||
        data._data?.quotedStanzaId ||
        data._data?.quotedMsg?.id ||
        null;

      let quotedBody =
        data.replyTo?.body ||
        data._data?.quotedMsg?.body ||
        data._data?.contextInfo?.quotedMessage?.conversation ||
        data._data?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
        data._data?.contextInfo?.quotedMessage?.imageMessage?.caption ||
        null;

      let quotedSender =
        data.replyTo?.participant ||
        data._data?.contextInfo?.participant ||
        null;

      // If quotedMsgId is present but quotedBody is missing, resolve from our local Message store!
      if (quotedMsgId && !quotedBody) {
        const originalMsg = await prisma.message.findFirst({
          where: {
            OR: [
              { id: quotedMsgId },
              { id: { contains: quotedMsgId } },
            ],
          },
        });
        if (originalMsg) {
          quotedBody = originalMsg.body || (originalMsg.mediaType !== 'text' ? `[${originalMsg.mediaType}]` : '');
          quotedSender = originalMsg.fromMe ? 'Anda' : (mappedContact?.name || 'Kontak');
        }
      } else if (quotedSender && quotedSender.includes('@')) {
        quotedSender = quotedSender.includes(data.fromMe ? data.from : data.to) ? 'Anda' : (mappedContact?.name || 'Kontak');
      }

      const defaultDisplayName =
        mappedContact?.name ||
        pushName ||
        (isLid(chatId) ? `WhatsApp User (${phone.slice(-6)})` : phone);

      // Ensure Contact exists if not mapped
      if (!mappedContact && !chatId.endsWith('@g.us')) {
        const existingByPhone = await prisma.contact.findFirst({
          where: { phone },
        });
        if (existingByPhone) {
          mappedContact = await prisma.contact.update({
            where: { id: existingByPhone.id },
            data: {
              jid: canonicalJid,
              lid: isLid(rawChatId) ? rawChatId : existingByPhone.lid,
              pushName: pushName || undefined,
            },
          });
        } else {
          mappedContact = await prisma.contact.upsert({
            where: { jid: canonicalJid },
            create: {
              phone,
              jid: canonicalJid,
              lid: isLid(rawChatId) ? rawChatId : null,
              pushName,
              name: defaultDisplayName,
              isWAUser: true,
            },
            update: {
              lid: isLid(rawChatId) ? rawChatId : undefined,
              pushName: pushName || undefined,
            },
          });
        }
      } else if (mappedContact && pushName && (!mappedContact.name || mappedContact.name === phone)) {
        mappedContact = await prisma.contact.update({
          where: { id: mappedContact.id },
          data: {
            pushName,
            name: pushName,
          },
        });
      }

      // Determine chat last message preview
      let lastMsgSnippet = text || '';
      if (mediaType !== 'text') {
        if (mediaType === 'image') lastMsgSnippet = text ? `📷 ${text}` : '📷 Foto';
        else if (mediaType === 'video') lastMsgSnippet = text ? `🎬 ${text}` : '🎬 Video';
        else if (mediaType === 'audio') lastMsgSnippet = '🎵 Audio';
        else lastMsgSnippet = fileName ? `📄 ${fileName}` : '📄 Dokumen';
      }

      // Step 1: Ensure Chat record exists first (so foreign key on Message is valid)
      await prisma.chat.upsert({
        where: { id: chatId },
        create: {
          id: chatId,
          name: mappedContact?.name || mappedContact?.pushName || defaultDisplayName,
          isGroup: chatId.endsWith('@g.us'),
          lastMessage: lastMsgSnippet,
          lastMessageAt: timestamp,
          unreadCount: 0,
          contactId: mappedContact?.id || null,
        },
        update: {
          name: mappedContact?.name || mappedContact?.pushName || undefined,
          contactId: mappedContact?.id || undefined,
        },
      });

      // Step 2: ATOMIC INSERT of Message.
      // If another concurrent request already created this message, Prisma throws unique constraint P2002.
      // Only the ONE request that successfully creates the message will increment unreadCount!
      try {
        await prisma.message.create({
          data: {
            id: msgId,
            chatId,
            contactId: mappedContact?.id || null,
            fromMe,
            body: text,
            mediaType,
            mediaUrl,
            fileName,
            ackStatus: fromMe ? 1 : 0,
            quotedMsgId,
            quotedBody,
            quotedSender,
            senderName: chatId.endsWith('@g.us') && !fromMe ? (pushName || data._data?.key?.participant || null) : null,
            timestamp,
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          console.log(`[Webhook] Atomic duplicate prevented by DB unique constraint for msgId: ${msgId}`);
          return NextResponse.json({ ok: true, ignored: 'db_unique_collision' });
        }
        throw err;
      }

      // Step 3: Now update Chat lastMessage, lastMessageAt, lastInboundAt, and increment unreadCount exactly +1 for incoming
      const updatedChat = await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessage: lastMsgSnippet,
          lastMessageAt: timestamp,
          ...(fromMe ? {} : { lastInboundAt: timestamp }),
          unreadCount: fromMe ? 0 : { increment: 1 },
        },
      });

      if (!fromMe) {
        await createLog(
          'MESSAGE_RECEIVED',
          'SUCCESS',
          `Pesan baru dari ${mappedContact?.name || pushName || chatId}: ${lastMsgSnippet}`,
          { chatId, msgId, mediaType }
        );

        // Optional automation from Admin Settings (Auto-Assign Round-Robin + Away Message)
        try {
          const settings = await getWorkspaceSettings();

          // 3a. Round-Robin Auto-Assign for unassigned private chats
          if (
            !updatedChat.assigneeId &&
            !updatedChat.isGroup &&
            settings.slaHours.assignMode === 'ROUND_ROBIN'
          ) {
            const activeOps = await prisma.user.findMany({
              where: { isActive: true },
              select: { id: true },
              orderBy: { createdAt: 'asc' },
            });
            if (activeOps.length > 0) {
              // Pick operator with fewest open/follow-up chats
              const counts = await Promise.all(
                activeOps.map(async (op) => ({
                  id: op.id,
                  count: await prisma.chat.count({
                    where: { assigneeId: op.id, status: { not: 'RESOLVED' } },
                  }),
                }))
              );
              counts.sort((a, b) => a.count - b.count);
              await prisma.chat.update({
                where: { id: chatId },
                data: { assigneeId: counts[0].id },
              });
            }
          }

          // 3b. Away Message outside working hours (max 1x per 24h per chat, non-group only)
          if (
            settings.slaHours.awayEnabled &&
            !updatedChat.isGroup &&
            settings.slaHours.awayMessage &&
            isOutsideWorkingHours(new Date(), settings.slaHours.workStart, settings.slaHours.workEnd)
          ) {
            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const lastSent = updatedChat.lastAwaySentAt ? updatedChat.lastAwaySentAt.getTime() : 0;
            if (lastSent < twentyFourHoursAgo) {
              await waha.sendText(chatId, settings.slaHours.awayMessage);
              await prisma.chat.update({
                where: { id: chatId },
                data: { lastAwaySentAt: new Date() },
              });
            }
          }
        } catch (autoErr) {
          console.warn('[Webhook] Automation hook skipped:', autoErr);
        }
      }

      return NextResponse.json({ ok: true, processed: 'message', routedTo: chatId, isNewIncoming: !fromMe });
    }

    // 2. Handle Message Delivery / Read Receipt (ACK)
    if (event === 'message.ack') {
      const rawAckId = data.id?.id || data.id;
      const ack = typeof data.ack === 'number' ? data.ack : 1;

      if (rawAckId) {
        const stanza = typeof rawAckId === 'string' ? extractStanzaId(rawAckId) : '';
        await prisma.message.updateMany({
          where: {
            OR: [
              { id: rawAckId },
              ...(stanza ? [
                { id: stanza },
                { id: { endsWith: stanza } },
              ] : []),
            ],
          },
          data: { ackStatus: ack },
        });
      }
      return NextResponse.json({ ok: true, processed: 'message.ack' });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    await createLog('ERROR', 'ERROR', `Webhook error: ${err.message}`, undefined, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
