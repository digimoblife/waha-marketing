import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeJid } from '@/lib/phone';

export const dynamic = 'force-dynamic';

function formatMessageSnippet(msg: {
  body: string | null;
  mediaType: string | null;
  fileName: string | null;
}): string | null {
  if (msg.mediaType === 'image') return msg.body ? `📷 ${msg.body}` : '📷 Foto';
  if (msg.mediaType === 'video') return msg.body ? `🎬 ${msg.body}` : '🎬 Video';
  if (msg.mediaType === 'audio') return '🎵 Audio';
  if (msg.mediaType === 'document') return msg.fileName ? `📄 ${msg.fileName}` : '📄 Dokumen';
  return msg.body;
}

/**
 * Merge two contacts / chats:
 * Typically merges a temporary WhatsApp LID (e.g. 254468272721966@lid)
 * into a known phone number contact (e.g. 628991607191@c.us).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sourceJid = normalizeJid(body.sourceJid || '');
    const targetJid = normalizeJid(body.targetJid || '');

    if (!sourceJid || !targetJid) {
      return NextResponse.json(
        { error: 'sourceJid and targetJid are required' },
        { status: 400 }
      );
    }

    if (sourceJid === targetJid) {
      return NextResponse.json({ ok: true });
    }

    await prisma.$transaction(async (tx) => {
      const sourceContact = await tx.contact.findUnique({
        where: { jid: sourceJid },
      });
      const targetContact = await tx.contact.findUnique({
        where: { jid: targetJid },
      });

      if (!targetContact) {
        throw new Error('Target contact tidak ditemukan');
      }

      // Clear source lid first to prevent unique constraint violation
      if (sourceContact?.lid) {
        await tx.contact.update({
          where: { id: sourceContact.id },
          data: { lid: null },
        });
      }

      // 1. Update target contact's lid if source was a LID
      if (sourceJid.endsWith('@lid') || (sourceContact?.phone && sourceContact.phone.length === 15)) {
        await tx.contact.update({
          where: { id: targetContact.id },
          data: { lid: sourceJid },
        });
      }

      // 2. Ensure target Chat exists
      await tx.chat.upsert({
        where: { id: targetJid },
        create: {
          id: targetJid,
          name: targetContact.name || targetContact.phone,
          contactId: targetContact.id,
        },
        update: {
          contactId: targetContact.id,
        },
      });

      // 3. Move all messages from source chat to target chat
      await tx.message.updateMany({
        where: { chatId: sourceJid },
        data: {
          chatId: targetJid,
          contactId: targetContact.id,
        },
      });

      // 4. Update lastMessage and lastMessageAt on target chat from newest message
      const latestMessage = await tx.message.findFirst({
        where: { chatId: targetJid },
        orderBy: { timestamp: 'desc' },
      });

      if (latestMessage) {
        await tx.chat.update({
          where: { id: targetJid },
          data: {
            lastMessage: formatMessageSnippet(latestMessage),
            lastMessageAt: latestMessage.timestamp,
          },
        });
      }

      // 5. Delete source chat and source contact
      await tx.chat.deleteMany({
        where: { id: sourceJid },
      });

      if (sourceContact && sourceContact.id !== targetContact.id) {
        await tx.contact.delete({
          where: { id: sourceContact.id },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      mergedInto: targetJid,
      message: 'Berhasil menghubungkan dan menggabungkan obrolan!',
    });
  } catch (err: any) {
    console.error('Merge error:', err);
    const status = err.message === 'Target contact tidak ditemukan' ? 404 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
