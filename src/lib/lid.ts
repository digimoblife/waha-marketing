import fs from 'fs';
import path from 'path';

/**
 * Resolves a WhatsApp LID (e.g. "252381002506321@lid" or "252381002506321")
 * to its canonical phone number using Baileys reverse mapping files stored in waha_sessions.
 */
export function resolveLidToPhone(lid: string): string | null {
  try {
    if (!lid) return null;
    const cleanLid = lid.replace('@lid', '').replace(/[^0-9]/g, '');
    if (!cleanLid) return null;

    const baseDirs = [
      '/app/waha_sessions/noweb',
      path.join(process.cwd(), 'waha_sessions', 'noweb'),
      '/app/.sessions/noweb',
      path.join(process.cwd(), '.sessions', 'noweb'),
    ];

    const targetFile = `lid-mapping-${cleanLid}_reverse.json`;

    for (const base of baseDirs) {
      if (!fs.existsSync(base)) continue;

      // First check default session
      const direct = path.join(base, 'default', targetFile);
      if (fs.existsSync(direct)) {
        const raw = fs.readFileSync(direct, 'utf8').trim();
        const phone = JSON.parse(raw);
        if (phone && typeof phone === 'string') return phone;
      }

      // Check all session subdirectories
      try {
        const sessions = fs.readdirSync(base, { withFileTypes: true });
        for (const s of sessions) {
          if (s.isDirectory()) {
            const p = path.join(base, s.name, targetFile);
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              const phone = JSON.parse(raw);
              if (phone && typeof phone === 'string') return phone;
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('[LID Resolver] Error resolving LID to phone:', err);
  }
  return null;
}

/**
 * Resolves a phone number to its WhatsApp LID if known.
 */
export function resolvePhoneToLid(phone: string): string | null {
  try {
    if (!phone) return null;
    const cleanPhone = phone.replace('@c.us', '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;

    const baseDirs = [
      '/app/waha_sessions/noweb',
      path.join(process.cwd(), 'waha_sessions', 'noweb'),
      '/app/.sessions/noweb',
      path.join(process.cwd(), '.sessions', 'noweb'),
    ];

    const targetFile = `lid-mapping-${cleanPhone}.json`;

    for (const base of baseDirs) {
      if (!fs.existsSync(base)) continue;

      // Check default session
      const direct = path.join(base, 'default', targetFile);
      if (fs.existsSync(direct)) {
        const raw = fs.readFileSync(direct, 'utf8').trim();
        const lid = JSON.parse(raw);
        if (lid && typeof lid === 'string') return `${lid}@lid`;
      }

      // Check all session subdirectories
      try {
        const sessions = fs.readdirSync(base, { withFileTypes: true });
        for (const s of sessions) {
          if (s.isDirectory()) {
            const p = path.join(base, s.name, targetFile);
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              const lid = JSON.parse(raw);
              if (lid && typeof lid === 'string') return `${lid}@lid`;
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('[LID Resolver] Error resolving phone to LID:', err);
  }
  return null;
}

/**
 * Auto-heals Contacts whose JID was saved as @lid despite having a resolved phone number,
 * and merges duplicate @lid + @c.us Chat threads belonging to the same Contact/phone.
 */
export async function healDuplicateLidChats(prismaClient: any): Promise<void> {
  try {
    // 1. Heal Contacts with @lid JID when a real phone number is known or resolvable
    const lidContacts = await prismaClient.contact.findMany({
      where: { jid: { endsWith: '@lid' } },
    });

    for (const c of lidContacts) {
      const rawLidDigits = String(c.jid).replace(/@lid$/, '');
      const resolvedFromSession = resolveLidToPhone(c.jid);
      const cleanStoredPhone = String(c.phone || '').replace(/[^0-9]/g, '');
      const realPhone =
        resolvedFromSession ||
        (cleanStoredPhone && cleanStoredPhone !== rawLidDigits ? cleanStoredPhone : null);

      if (!realPhone) continue;
      const canonicalJid = `${realPhone}@c.us`;

      const existingTarget = await prismaClient.contact.findFirst({
        where: { jid: canonicalJid, id: { not: c.id } },
      });

      if (existingTarget) {
        // Merge duplicate Contact into existing canonical Contact
        await prismaClient.contact
          .update({
            where: { id: existingTarget.id },
            data: { lid: existingTarget.lid || c.jid },
          })
          .catch(() => null);
        await prismaClient.message
          .updateMany({
            where: { OR: [{ chatId: c.jid }, { contactId: c.id }] },
            data: { chatId: canonicalJid, contactId: existingTarget.id },
          })
          .catch(() => null);
        await prismaClient.supportIssue
          .updateMany({
            where: { OR: [{ chatId: c.jid }, { contactId: c.id }] },
            data: { chatId: canonicalJid, contactId: existingTarget.id },
          })
          .catch(() => null);
        await prismaClient.chat.deleteMany({ where: { id: c.jid } }).catch(() => null);
        await prismaClient.contact.delete({ where: { id: c.id } }).catch(() => null);
      } else {
        await prismaClient.contact
          .update({
            where: { id: c.id },
            data: {
              phone: realPhone,
              lid: c.lid || c.jid,
              jid: canonicalJid,
            },
          })
          .catch(() => null);
      }
    }

    // 2. Merge any remaining @lid Chat rows whose Contact (or Baileys reverse map) has a canonical @c.us JID
    const lidChats = await prismaClient.chat.findMany({
      where: { id: { endsWith: '@lid' } },
      include: { contact: true },
    });

    for (const lc of lidChats) {
      const rawLidDigits = String(lc.id).replace(/@lid$/, '');
      const resolvedPhone =
        (lc.contact?.jid && lc.contact.jid.endsWith('@c.us')
          ? lc.contact.jid.replace(/@c\.us$/, '')
          : null) ||
        (lc.contact?.phone && lc.contact.phone !== rawLidDigits ? lc.contact.phone : null) ||
        resolveLidToPhone(lc.id);

      if (!resolvedPhone) continue;
      const canonicalChatId = `${resolvedPhone}@c.us`;
      if (canonicalChatId === lc.id) continue;

      const targetChat = await prismaClient.chat.findUnique({
        where: { id: canonicalChatId },
      });

      if (targetChat) {
        await prismaClient.message
          .updateMany({
            where: { chatId: lc.id },
            data: {
              chatId: canonicalChatId,
              ...(targetChat.contactId ? { contactId: targetChat.contactId } : {}),
            },
          })
          .catch(() => null);
        await prismaClient.supportIssue
          .updateMany({
            where: { chatId: lc.id },
            data: { chatId: canonicalChatId },
          })
          .catch(() => null);

        const lcTime = lc.lastMessageAt ? new Date(lc.lastMessageAt).getTime() : 0;
        const tgtTime = targetChat.lastMessageAt
          ? new Date(targetChat.lastMessageAt).getTime()
          : 0;
        const useLcLatest = lcTime >= tgtTime && Boolean(lc.lastMessage);

        await prismaClient.chat
          .update({
            where: { id: canonicalChatId },
            data: {
              lastMessage: useLcLatest ? lc.lastMessage : targetChat.lastMessage,
              lastMessageAt: useLcLatest ? lc.lastMessageAt : targetChat.lastMessageAt,
              unreadCount: (targetChat.unreadCount || 0) + (lc.unreadCount || 0),
              contactId: targetChat.contactId || lc.contactId || null,
            },
          })
          .catch(() => null);

        await prismaClient.chat.delete({ where: { id: lc.id } }).catch(() => null);
      } else {
        // Rename/recreate @lid chat as canonical @c.us chat
        await prismaClient.chat.create({
          data: {
            id: canonicalChatId,
            name: lc.contact?.name || lc.name,
            isGroup: false,
            status: lc.status,
            agentMode: lc.agentMode,
            lastMessage: lc.lastMessage,
            lastMessageAt: lc.lastMessageAt,
            unreadCount: lc.unreadCount,
            contactId: lc.contactId,
            assigneeId: lc.assigneeId,
            reminderAt: lc.reminderAt,
            reminderNote: lc.reminderNote,
          },
        });
        await prismaClient.message
          .updateMany({
            where: { chatId: lc.id },
            data: { chatId: canonicalChatId },
          })
          .catch(() => null);
        await prismaClient.supportIssue
          .updateMany({
            where: { chatId: lc.id },
            data: { chatId: canonicalChatId },
          })
          .catch(() => null);
        await prismaClient.chat.delete({ where: { id: lc.id } }).catch(() => null);
      }
    }
  } catch (err) {
    console.warn('[LID Healer] Skipped duplicate LID merge:', err);
  }
}
