import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { waha } from '@/lib/waha';
import { sanitizePhone, normalizeJid } from '@/lib/phone';
import { createLog } from '@/lib/logger';

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

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'asc' },
      take: 150,
    });

    return NextResponse.json({ messages });
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
      // Send file to WAHA using docker URL (accessible from container) or mediaUrl
      const targetFileUrl = dockerUrl || mediaUrl;
      wahaRes = await waha.sendFile(
        chatId,
        targetFileUrl,
        caption || undefined,
        replyTo || undefined,
        fileName || undefined,
        mimeType || undefined
      );
    } else {
      wahaRes = await waha.sendText(chatId, text, replyTo);
    }

    const msgId = wahaRes?.key?.id || wahaRes?.id || wahaRes?._data?.id || `out_${Date.now()}`;

    // 5. Save message to database
    const savedMessage = await prisma.message.create({
      data: {
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
