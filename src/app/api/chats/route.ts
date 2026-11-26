import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, normalizeJid } from '@/lib/phone';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Auto-heal any stray @s.whatsapp.net chats
    const sNetChats = await prisma.chat.findMany({
      where: { id: { endsWith: '@s.whatsapp.net' } },
    });
    for (const sc of sNetChats) {
      const canonicalId = sc.id.replace(/@s\.whatsapp\.net$/, '@c.us');
      await prisma.message.updateMany({
        where: { chatId: sc.id },
        data: { chatId: canonicalId },
      });
      await prisma.chat.delete({ where: { id: sc.id } }).catch(() => null);
    }

    // 2. Auto-heal any contacts saved with @s.whatsapp.net jid
    const sNetContacts = await prisma.contact.findMany({
      where: { jid: { endsWith: '@s.whatsapp.net' } },
    });
    for (const sc of sNetContacts) {
      const canonicalJid = sc.jid.replace(/@s\.whatsapp\.net$/, '@c.us');
      await prisma.contact.update({
        where: { id: sc.id },
        data: { jid: canonicalJid },
      }).catch(() => null);
    }

    const chats = await prisma.chat.findMany({
      include: {
        contact: true,
        assignee: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
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
    const rawChatId = body.chatId;

    if (!rawChatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatId = normalizeJid(rawChatId);
    const phone = sanitizePhone(chatId.replace(/@c\.us$/, '').replace(/@g\.us$/, ''));

    // Find contact if exists by jid or phone
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { jid: chatId },
          { phone },
        ],
      },
    });

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
        assignee: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, chat });
  } catch (err: any) {
    console.error('Error in POST /api/chats:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Update chat status, assigneeId, or follow-up reminder
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId: rawChatId, status, assigneeId, reminderAt, reminderNote, clearReminder } = body;

    if (!rawChatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatId = normalizeJid(rawChatId);
    const data: any = {};

    if (status !== undefined) {
      if (!['OPEN', 'FOLLOW_UP', 'RESOLVED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      data.status = status;
    }

    if (assigneeId !== undefined) {
      data.assigneeId = assigneeId ? String(assigneeId) : null;
    }

    if (clearReminder) {
      data.reminderAt = null;
      data.reminderNote = null;
    } else {
      if (reminderAt !== undefined) {
        data.reminderAt = reminderAt ? new Date(reminderAt) : null;
      }
      if (reminderNote !== undefined) {
        data.reminderNote = reminderNote ? String(reminderNote).trim() : null;
      }
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data,
      include: {
        contact: true,
        assignee: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, chat: updated });
  } catch (err: any) {
    console.error('Error in PATCH /api/chats:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Clear chat messages or delete chat completely
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawChatId = searchParams.get('chatId');
    const mode = searchParams.get('mode') || 'clear_messages'; // 'clear_messages' | 'delete_chat'

    if (!rawChatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatId = normalizeJid(rawChatId);
    const sNetId = chatId.endsWith('@c.us') ? chatId.replace(/@c\.us$/, '@s.whatsapp.net') : null;

    if (mode === 'delete_chat') {
      // 1. Delete all messages for this chat (both canonical and sNet if any)
      await prisma.message.deleteMany({
        where: {
          OR: [
            { chatId },
            ...(sNetId ? [{ chatId: sNetId }] : []),
          ],
        },
      });

      // 2. Delete the chat record(s)
      await prisma.chat.deleteMany({
        where: {
          OR: [
            { id: chatId },
            ...(sNetId ? [{ id: sNetId }] : []),
          ],
        },
      });

      await createLog('CHAT_CLEARED', 'SUCCESS', `Obrolan ${chatId} dihapus sepenuhnya`);

      return NextResponse.json({
        ok: true,
        mode: 'delete_chat',
        message: 'Obrolan berhasil dihapus',
      });
    } else {
      // Clear messages only, retain chat thread
      const deleted = await prisma.message.deleteMany({
        where: {
          OR: [
            { chatId },
            ...(sNetId ? [{ chatId: sNetId }] : []),
          ],
        },
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
