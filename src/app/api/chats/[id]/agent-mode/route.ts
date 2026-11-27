import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeJid } from '@/lib/phone';
import { cancelDebouncedChat } from '@/lib/agent/debouncer';
import { getRequestUser } from '@/lib/session-user';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rawId = decodeURIComponent(params.id || '');
    if (!rawId) {
      return NextResponse.json({ error: 'Chat ID wajib diisi' }, { status: 400 });
    }

    const chatId = normalizeJid(rawId);
    const body = await req.json();
    const nextMode = String(body.agentMode || '');

    if (!['AI_ACTIVE', 'STEP_BY_STEP', 'WAITING_TECH', 'HUMAN_TAKEOVER'].includes(nextMode)) {
      return NextResponse.json({ error: 'agentMode tidak valid' }, { status: 400 });
    }

    if (nextMode === 'HUMAN_TAKEOVER') {
      cancelDebouncedChat(chatId);
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        agentMode: nextMode,
        ...(nextMode === 'AI_ACTIVE' ? { activeGuideState: null } : {}),
      },
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, username: true, role: true },
        },
      },
    });

    const user = await getRequestUser(req);
    await createLog(
      'AGENT',
      'SUCCESS',
      `Mode Agent pada chat ${chatId} diubah ke ${nextMode} oleh ${user?.name || 'Operator'}`,
      { chatId, agentMode: nextMode }
    );

    return NextResponse.json({ ok: true, chat: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal mengubah mode chat' }, { status: 500 });
  }
}
