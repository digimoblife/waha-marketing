import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, isLid, normalizeJid, jidToPhone } from '@/lib/phone';
import { resolveLidToPhone } from '@/lib/lid';
import { createLog } from '@/lib/logger';

// In-memory cache of recently received message IDs to eliminate concurrent duplicate webhooks (0ms latency check)
const processedMsgIds = new Set<string>();

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

      // Fast in-memory deduplication: if this msgId is already being processed, discard immediately
      if (processedMsgIds.has(msgId)) {
        console.log(`[Webhook] Concurrent duplicate ignored in-memory for msgId: ${msgId}`);
        return NextResponse.json({ ok: true, ignored: 'duplicate_in_memory' });
      }
      processedMsgIds.add(msgId);
      setTimeout(() => processedMsgIds.delete(msgId), 60000);

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

      // Database check: if message already exists, do not process again
      const existingMsg = await prisma.message.findUnique({
        where: { id: msgId },
      });
      if (existingMsg) {
        return NextResponse.json({ ok: true, ignored: 'already_exists_in_db' });
      }

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

      // Look for real sender / pushName in all possible WAHA fields
      const pushName =
        data.pushName ||
        data._data?.notifyName ||
        data._data?.pushName ||
        data._data?.verifiedName ||
        null;

      const rawPhone = (resolvedPhone || chatId).replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
      const phone = isLid(chatId) ? rawPhone : sanitizePhone(rawPhone);
      const text = data.body || (data._data && data._data.body) || '';
      
      // Media detection
      let mediaType = 'text';
      if (data.hasMedia || data.type === 'image' || data.type === 'video' || data.type === 'audio' || data.type === 'document') {
        mediaType = data.type || (data._data?.mimetype?.startsWith('image/') ? 'image' : data._data?.mimetype?.startsWith('video/') ? 'video' : 'document');
      }

      const mediaUrl = data.mediaUrl || data._data?.mediaUrl || data.media?.url || null;
      const fileName = data.filename || data._data?.filename || null;
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

      // Step 3: Now update Chat lastMessage, lastMessageAt, and increment unreadCount exactly +1 for incoming
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessage: lastMsgSnippet,
          lastMessageAt: timestamp,
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
      }

      return NextResponse.json({ ok: true, processed: 'message', routedTo: chatId, isNewIncoming: !fromMe });
    }

    // 2. Handle Message Delivery / Read Receipt (ACK)
    if (event === 'message.ack') {
      const msgId = data.id?.id || data.id;
      const ack = typeof data.ack === 'number' ? data.ack : 1;

      if (msgId) {
        await prisma.message.updateMany({
          where: { id: msgId },
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
