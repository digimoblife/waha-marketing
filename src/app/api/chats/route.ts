import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone } from '@/lib/phone';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const chats = await prisma.chat.findMany({
      include: {
        contact: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json({ chats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Open/Create chat and reset unread count
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId } = body;

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    // Find contact if exists
    const contact = await prisma.contact.findUnique({
      where: { jid: chatId },
    });

    const phone = sanitizePhone(chatId.replace(/@c\.us$/, '').replace(/@g\.us$/, ''));
    const displayName = contact?.name || contact?.pushName || phone;

    // Ensure Chat exists in database
    const chat = await prisma.chat.upsert({
      where: { id: chatId },
      create: {
        id: chatId,
        name: displayName,
        isGroup: chatId.endsWith('@g.us'),
        unreadCount: 0,
        contactId: contact?.id || null,
      },
      update: {
        unreadCount: 0,
        contactId: contact?.id || undefined,
      },
      include: {
        contact: true,
      },
    });

    return NextResponse.json({ ok: true, chat });
  } catch (err: any) {
    console.error('Error in POST /api/chats:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Clear chat messages or delete chat completely
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    const mode = searchParams.get('mode') || 'clear_messages'; // 'clear_messages' | 'delete_chat'

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    if (mode === 'delete_chat') {
      // 1. Delete all messages for this chat
      await prisma.message.deleteMany({
        where: { chatId },
      });

      // 2. Delete the chat record
      await prisma.chat.delete({
        where: { id: chatId },
      }).catch(() => null);

      await createLog('CHAT_CLEARED', 'SUCCESS', `Obrolan ${chatId} dihapus sepenuhnya`);

      return NextResponse.json({
        ok: true,
        mode: 'delete_chat',
        message: 'Obrolan berhasil dihapus',
      });
    } else {
      // Clear messages only, retain chat thread
      const deleted = await prisma.message.deleteMany({
        where: { chatId },
      });

      await prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessage: null,
          unreadCount: 0,
        },
      }).catch(() => null);

      await createLog(
        'CHAT_CLEARED',
        'SUCCESS',
        `Riwayat ${deleted.count} pesan dalam obrolan ${chatId} berhasil dibersihkan`
      );

      return NextResponse.json({
        ok: true,
        mode: 'clear_messages',
        count: deleted.count,
        message: 'Riwayat pesan obrolan berhasil dibersihkan',
      });
    }
  } catch (err: any) {
    console.error('Error in DELETE /api/chats:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
