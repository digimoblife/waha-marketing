import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, normalizeJid, isLid } from '@/lib/phone';
import { healDuplicateLidChats, resolveLidToPhone } from '@/lib/lid';
import { createLog } from '@/lib/logger';
import { getWorkspaceSettings } from '@/lib/settings';
import { cancelDebouncedChat } from '@/lib/agent/debouncer';

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

    // 3. Auto-heal & merge any split @lid vs @c.us chats/contacts
    await healDuplicateLidChats(prisma);

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

    let chatId = normalizeJid(rawChatId);
    if (isLid(chatId)) {
      const resolved = resolveLidToPhone(chatId);
      if (resolved) {
        chatId = `${sanitizePhone(resolved)}@c.us`;
      }
    }
    const phone = sanitizePhone(chatId.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, ''));

    // Find contact if exists by jid, lid, or phone
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { jid: chatId },
          { lid: normalizeJid(rawChatId) },
          { phone },
        ],
      },
    });
    if (contact?.jid && contact.jid.endsWith('@c.us')) {
      chatId = contact.jid;
    }

    const displayName = contact?.name || contact?.pushName || phone;
    const settings = await getWorkspaceSettings();
    const initialMode = chatId.endsWith('@g.us')
      ? 'HUMAN_TAKEOVER'
      : settings.agentConfig.defaultChatAgentMode || 'AI_ACTIVE';

    // Ensure Chat exists in database
    const chat = await prisma.chat.upsert({
      where: { id: chatId },
      create: {
        id: chatId,
        name: displayName,
        isGroup: chatId.endsWith('@g.us'),
        agentMode: initialMode,
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

// PATCH: Update chat status, agentMode (single or bulk), assigneeId, or follow-up reminder
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    // Bulk per-chat AI ON/OFF toggle from Inbox list
    if (body.bulkAgentMode && ['AI_ACTIVE', 'HUMAN_TAKEOVER'].includes(body.bulkAgentMode)) {
      const targetMode = body.bulkAgentMode as 'AI_ACTIVE' | 'HUMAN_TAKEOVER';
      const ids: string[] | undefined = Array.isArray(body.chatIds)
        ? body.chatIds.map((id: unknown) => normalizeJid(String(id))).filter(Boolean)
        : undefined;

      if (targetMode === 'HUMAN_TAKEOVER' && ids) {
        for (const id of ids) cancelDebouncedChat(id);
      }

      const result = await prisma.chat.updateMany({
        where: {
          isGroup: false,
          ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
        },
        data: {
          agentMode: targetMode,
          ...(targetMode === 'AI_ACTIVE' ? { activeGuideState: null } : {}),
        },
      });

      await createLog(
        'AGENT',
        'SUCCESS',
        `Mode AI massal diubah ke ${targetMode} pada ${result.count} obrolan`
      );

      return NextResponse.json({ ok: true, updatedCount: result.count, agentMode: targetMode });
    }

    const { chatId: rawChatId, status, agentMode, assigneeId, reminderAt, reminderNote, clearReminder } = body;

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

    if (agentMode !== undefined) {
      if (!['AI_ACTIVE', 'STEP_BY_STEP', 'WAITING_TECH', 'HUMAN_TAKEOVER'].includes(agentMode)) {
        return NextResponse.json({ error: 'Invalid agentMode' }, { status: 400 });
      }
      data.agentMode = agentMode;
      if (agentMode === 'HUMAN_TAKEOVER') {
        cancelDebouncedChat(chatId);
      } else if (agentMode === 'AI_ACTIVE') {
        data.activeGuideState = null;
      }
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
