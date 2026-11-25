import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';
import { sanitizePhone, normalizeJid } from '@/lib/phone';
import { createLog } from '@/lib/logger';
import { markMessageProcessed, extractStanzaId } from '@/lib/msg-cache';

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

    const rawMessages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'asc' },
      take: 200,
    });

    // Deduplicate messages on the fly:
    // Two messages are duplicates if they share the same stanza ID or identical text/media within 10 seconds
    const dedupedMessages: typeof rawMessages = [];
    const seenStanzas = new Set<string>();
    const seenContentBuckets = new Set<string>();
    const duplicateIdsToDelete: string[] = [];

    for (const msg of rawMessages) {
      const stanza = extractStanzaId(msg.id);
      const timeBucket = Math.floor(new Date(msg.timestamp).getTime() / 15000); // 15-second bucket
      const contentKey = `${msg.chatId}_${msg.fromMe}_${(msg.body || '').trim()}_${timeBucket}`;

      const isStanzaDuplicate = stanza ? seenStanzas.has(stanza) : false;
      const isContentDuplicate = msg.body ? seenContentBuckets.has(contentKey) : false;

      if (isStanzaDuplicate || isContentDuplicate) {
        duplicateIdsToDelete.push(msg.id);
        continue;
      }

      if (stanza) seenStanzas.add(stanza);
      if (msg.body) seenContentBuckets.add(contentKey);
      dedupedMessages.push(msg);
    }

    // Asynchronously delete duplicate copies from database so DB stays permanently clean
    if (duplicateIdsToDelete.length > 0) {
      prisma.message.deleteMany({
        where: { id: { in: duplicateIdsToDelete } },
      }).catch(() => null);
    }

    return NextResponse.json({ messages: dedupedMessages });
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

    // 2. Ensure Chat exists in database FIRST before creating Message (satisfy foreign key)
    await prisma.chat.upsert({
      where: { id: chatId },
      create: {
        id: chatId,
        name: displayName,
        lastMessage: messageSnippet,
        lastMessageAt: timestamp,
        unreadCount: 0,
        contactId: contact?.id || null,
      },
      update: {
        lastMessage: messageSnippet,
        lastMessageAt: timestamp,
        unreadCount: 0,
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
    let wahaRes: any;
    if (mediaUrl) {
      let fileToSend = dockerUrl || mediaUrl;

      // If this is a local uploaded file, convert to base64 Data URL so WAHA receives the file
      // directly in-memory without making an external HTTP fetch that might fail or 404!
      if (typeof mediaUrl === 'string' && mediaUrl.startsWith('/uploads/')) {
        try {
          const localFilePath = path.join(process.cwd(), 'public', mediaUrl.replace(/^\//, ''));
          const fileBuf = await fs.readFile(localFilePath);
          const b64 = fileBuf.toString('base64');
          const finalMime = mimeType || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream');
          fileToSend = `data:${finalMime};base64,${b64}`;
        } catch (readErr) {
          console.warn('[Message] Could not read local media file for data URL:', readErr);
        }
      }

      wahaRes = await waha.sendFile(
        chatId,
        fileToSend,
        caption || undefined,
        replyTo || undefined,
        fileName || undefined,
        mimeType || undefined
      );

      // Validate WAHA response: If WAHA reported an error or non-200 status, throw error!
      if (wahaRes?.error || wahaRes?.status >= 400 || (wahaRes?.statusCode && wahaRes.statusCode >= 400)) {
        const errorMsg =
          wahaRes?.error?.message ||
          wahaRes?.message ||
          (typeof wahaRes?.error === 'string' ? wahaRes.error : 'Gagal mengirim file ke WhatsApp');
        throw new Error(errorMsg);
      }
    } else {
      wahaRes = await waha.sendText(chatId, text, replyTo);
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
