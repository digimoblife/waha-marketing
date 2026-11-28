import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';
import { sanitizePhone, normalizeJid } from '@/lib/phone';
import { createLog } from '@/lib/logger';
import { markMessageProcessed, extractStanzaId } from '@/lib/msg-cache';
import { detectMediaType, downloadWahaMedia, isWahaInternalMediaUrl } from '@/lib/waha-media';
import { cancelDebouncedChat } from '@/lib/agent/debouncer';

export const dynamic = 'force-dynamic';

// GET messages for a specific chat
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawChatId = searchParams.get('chatId');

    if (!rawChatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatId = normalizeJid(rawChatId);

    // Auto-heal: If any messages still have @s.whatsapp.net chatId, migrate them to canonical chatId
    if (chatId.endsWith('@c.us')) {
      const sNetId = chatId.replace(/@c\.us$/, '@s.whatsapp.net');
      await prisma.message.updateMany({
        where: { chatId: sNetId },
        data: { chatId },
      }).catch(() => null);
      await prisma.chat.deleteMany({
        where: { id: sNetId },
      }).catch(() => null);
    }

    // Reset unreadCount for this chat because operator is viewing/fetching its messages
    await prisma.chat.updateMany({
      where: { id: chatId, unreadCount: { gt: 0 } },
      data: { unreadCount: 0 },
    }).catch(() => null);

    // Fetch the NEWEST 200 messages (desc), then reverse to ascending order for display
    const newestMessages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    const rawMessages = newestMessages.reverse();

    // Hide copies of the same WhatsApp message stored under different ID formats
    // (e.g. serialized vs bare stanza). Identity is the stanza ID only: two messages with
    // identical text are still two messages. This read path never deletes rows.
    const dedupedMessages: typeof rawMessages = [];
    const seenStanzas = new Set<string>();

    for (const msg of rawMessages) {
      const stanza = extractStanzaId(msg.id);
      if (stanza && seenStanzas.has(stanza)) continue;
      if (stanza) seenStanzas.add(stanza);
      dedupedMessages.push(msg);
    }

    // Auto-heal any existing messages that still point to WAHA internal localhost:3000/api/files/
    for (const msg of dedupedMessages) {
      if (msg.mediaUrl && isWahaInternalMediaUrl(msg.mediaUrl)) {
        const localUrl = await downloadWahaMedia(msg.mediaUrl);
        if (localUrl) {
          const fixedType =
            msg.mediaType === 'document'
              ? detectMediaType(null, localUrl, msg.fileName)
              : msg.mediaType;
          msg.mediaUrl = localUrl;
          msg.mediaType = fixedType;
          prisma.message
            .update({
              where: { id: msg.id },
              data: { mediaUrl: localUrl, mediaType: fixedType },
            })
            .catch(() => null);
        }
      }
    }

    // A WAHA-internal URL that could not be downloaded is only reachable from the server
    // (e.g. http://localhost:3000/api/files/...). Never hand it to the browser: the UI shows
    // an "expired media" placeholder instead of a broken image or a dead link.
    const responseMessages = dedupedMessages.map((msg) =>
      msg.mediaUrl && isWahaInternalMediaUrl(msg.mediaUrl)
        ? { ...msg, mediaUrl: null, mediaUnavailable: true }
        : msg
    );

    return NextResponse.json({ messages: responseMessages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST send message (Supports Text, Image, Video, Document, and Reply)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      chatId: rawChatId,
      text,
      replyTo,
      mediaUrl,
      dockerUrl,
      mediaType = 'text',
      fileName,
      mimeType,
      caption,
    } = body;

    if (!rawChatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatId = normalizeJid(rawChatId);

    if (!text && !mediaUrl) {
      return NextResponse.json({ error: 'text or mediaUrl is required' }, { status: 400 });
    }

    const timestamp = new Date();

    // 1. Find or associate contact
    const phone = sanitizePhone(chatId.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, ''));
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { jid: chatId },
          { phone },
          { lid: chatId },
        ],
      },
    });

    const displayName = contact?.name || contact?.pushName || phone;

    // Determine message display snippet for chat preview
    let messageSnippet = text || '';
    if (mediaUrl) {
      if (mediaType === 'image') {
        messageSnippet = caption ? `📷 ${caption}` : '📷 Foto';
      } else if (mediaType === 'video') {
        messageSnippet = caption ? `🎬 ${caption}` : '🎬 Video';
      } else if (mediaType === 'audio') {
        messageSnippet = '🎵 Audio';
      } else {
        messageSnippet = fileName ? `📄 ${fileName}` : '📄 Dokumen';
      }
    }

    // Cancel any pending AI debounce timer immediately because a human operator is replying manually
    const keepAiActive = Boolean(body.keepAiActive);
    if (!keepAiActive) {
      cancelDebouncedChat(chatId);
    }

    // 2. Ensure Chat exists in database FIRST before creating Message (satisfy foreign key)
    // Invariant #3: Manual operator reply automatically switches agentMode to HUMAN_TAKEOVER
    await prisma.chat.upsert({
      where: { id: chatId },
      create: {
        id: chatId,
        name: displayName,
        lastMessage: messageSnippet,
        lastMessageAt: timestamp,
        unreadCount: 0,
        agentMode: keepAiActive ? 'AI_ACTIVE' : 'HUMAN_TAKEOVER',
        contactId: contact?.id || null,
      },
      update: {
        lastMessage: messageSnippet,
        lastMessageAt: timestamp,
        unreadCount: 0,
        ...(keepAiActive ? {} : { agentMode: 'HUMAN_TAKEOVER' }),
        contactId: contact?.id || undefined,
      },
    });

    // 3. Resolve quoted context if replyTo is provided
    let quotedBody: string | null = null;
    let quotedSender: string | null = null;
    if (replyTo) {
      const origMsg = await prisma.message.findUnique({
        where: { id: replyTo },
      });
      if (origMsg) {
        quotedBody = origMsg.body || (origMsg.mediaType !== 'text' ? `[${origMsg.mediaType}]` : '');
        quotedSender = origMsg.fromMe ? 'Anda' : (contact?.name || 'Kontak');
      }
    }

    // 4. Send via WAHA WhatsApp API (Text or File)
    // Only pass valid WhatsApp message IDs as reply_to (skip local fallback out_* IDs)
    const wahaReplyTo =
      replyTo && !String(replyTo).startsWith('out_') ? replyTo : undefined;

    let wahaRes: any;
    if (mediaUrl) {
      let fileToSend = dockerUrl || mediaUrl;

      // For local files <= 5MB (images/small docs), convert to base64 Data URL so WAHA receives
      // bytes directly without an HTTP fetch. For larger files (> 5MB, e.g. videos), stream via
      // dockerUrl (/uploads/[...path]) to avoid Node.js RAM spikes and large JSON timeouts.
      const MAX_BASE64_BYTES = 5 * 1024 * 1024;
      if (typeof mediaUrl === 'string' && mediaUrl.startsWith('/uploads/')) {
        try {
          const localFilePath = path.join(process.cwd(), 'public', mediaUrl.replace(/^\//, ''));
          const stat = await fs.stat(localFilePath);
          if (stat.size <= MAX_BASE64_BYTES) {
            const fileBuf = await fs.readFile(localFilePath);
            const b64 = fileBuf.toString('base64');
            const finalMime = mimeType || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream');
            fileToSend = `data:${finalMime};base64,${b64}`;
          }
        } catch (readErr) {
          console.warn('[Message] Could not read local media file for data URL:', readErr);
        }
      }

      if (mediaType === 'image') {
        wahaRes = await waha.sendImage(
          chatId,
          fileToSend,
          caption || undefined,
          wahaReplyTo,
          fileName || undefined,
          mimeType || undefined
        );
      } else if (mediaType === 'video') {
        wahaRes = await waha.sendVideo(
          chatId,
          fileToSend,
          caption || undefined,
          wahaReplyTo,
          fileName || undefined,
          mimeType || undefined
        );
      } else {
        wahaRes = await waha.sendFile(
          chatId,
          fileToSend,
          caption || undefined,
          wahaReplyTo,
          fileName || undefined,
          mimeType || undefined
        );
      }
    } else {
      wahaRes = await waha.sendText(chatId, text, wahaReplyTo);
    }

    // Validate WAHA response for both sendFile and sendText
    if (wahaRes?.error || wahaRes?.status >= 400 || (wahaRes?.statusCode && wahaRes.statusCode >= 400)) {
      const errorMsg =
        wahaRes?.error?.message ||
        wahaRes?.message ||
        (typeof wahaRes?.error === 'string' ? wahaRes.error : 'Gagal mengirim pesan ke WhatsApp');
      throw new Error(errorMsg);
    }

    const stanzaId = wahaRes?.key?.id || wahaRes?.id || wahaRes?._data?.id;
    const msgId = stanzaId ? `true_${chatId}_${stanzaId}` : `out_${Date.now()}`;

    // Mark in memory cache so incoming webhook immediately ignores it
    if (stanzaId) markMessageProcessed(stanzaId);
    markMessageProcessed(msgId);

    // 5. Save message to database (or update if already inserted by webhook)
    const savedMessage = await prisma.message.upsert({
      where: { id: msgId },
      create: {
        id: msgId,
        chatId,
        contactId: contact?.id || null,
        fromMe: true,
        body: mediaUrl ? (caption || null) : text,
        mediaType: mediaType,
        mediaUrl: mediaUrl || null,
        fileName: fileName || null,
        ackStatus: 1, // Sent
        quotedMsgId: replyTo || null,
        quotedBody,
        quotedSender,
        timestamp,
      },
      update: {
        ackStatus: 1,
      },
    });

    await createLog(
      mediaUrl ? 'MEDIA_UPLOAD' : 'MESSAGE_SENT',
      'SUCCESS',
      `Pesan ${mediaType} terkirim ke ${displayName} (${chatId})`,
      { chatId, msgId, mediaType }
    );

    return NextResponse.json({
      message: savedMessage,
      waha: wahaRes,
    });
  } catch (err: any) {
    console.error('Send message error:', err);
    await createLog(
      'ERROR',
      'ERROR',
      `Gagal mengirim pesan: ${err.message}`,
      undefined,
      err.message
    );
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
