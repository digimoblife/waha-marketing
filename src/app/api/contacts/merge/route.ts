import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Merge two contacts / chats:
 * Typically merges a temporary WhatsApp LID (e.g. 254468272721966@lid)
 * into a known phone number contact (e.g. 628991607191@c.us).
 */
export async function POST(req: NextRequest) {
  try {
    const { sourceJid, targetJid } = await req.json();

    if (!sourceJid || !targetJid) {
      return NextResponse.json(
        { error: 'sourceJid and targetJid are required' },
        { status: 400 }
      );
    }

    if (sourceJid === targetJid) {
      return NextResponse.json({ ok: true });
    }

    // Find both contacts
    const sourceContact = await prisma.contact.findUnique({
      where: { jid: sourceJid },
    });
    const targetContact = await prisma.contact.findUnique({
      where: { jid: targetJid },
    });

    if (!targetContact) {
      return NextResponse.json(
        { error: 'Target contact tidak ditemukan' },
        { status: 404 }
      );
    }

    // 1. Update target contact's lid if source was a LID
    if (sourceJid.endsWith('@lid') || (sourceContact?.phone && sourceContact.phone.length === 15)) {
      await prisma.contact.update({
        where: { id: targetContact.id },
        data: { lid: sourceJid },
      });
    }

    // 2. Ensure target Chat exists
    await prisma.chat.upsert({
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
    await prisma.message.updateMany({
      where: { chatId: sourceJid },
      data: {
        chatId: targetJid,
        contactId: targetContact.id,
      },
    });

    // 4. Update lastMessage and lastMessageAt on target chat from newest message
    const latestMessage = await prisma.message.findFirst({
      where: { chatId: targetJid },
      orderBy: { timestamp: 'desc' },
    });

    if (latestMessage) {
      await prisma.chat.update({
        where: { id: targetJid },
        data: {
          lastMessage: latestMessage.body,
          lastMessageAt: latestMessage.timestamp,
        },
      });
    }

    // 5. Delete source chat and source contact
    await prisma.chat.deleteMany({
      where: { id: sourceJid },
    });

    if (sourceContact && sourceContact.id !== targetContact.id) {
      await prisma.contact.delete({
        where: { id: sourceContact.id },
      });
    }

    return NextResponse.json({
      ok: true,
      mergedInto: targetJid,
      message: 'Berhasil menghubungkan dan menggabungkan obrolan!',
    });
  } catch (err: any) {
    console.error('Merge error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
