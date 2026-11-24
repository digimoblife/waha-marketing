import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, phoneToJid } from '@/lib/phone';
import { waha } from '@/lib/waha';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET all contacts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('q') || '';
    const tag = searchParams.get('tag') || '';
    const category = searchParams.get('category') || '';
    const isMerchant = searchParams.get('isMerchant') === 'true';

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { pushName: { contains: search } },
        { storeName: { contains: search } },
        { businessCategory: { contains: search } },
        { address: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (tag) {
      where.tags = { contains: tag };
    }
    if (category) {
      where.businessCategory = { contains: category };
    }
    if (isMerchant) {
      where.storeName = { not: null };
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ contacts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST create contact or sync from WAHA
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if request is to sync from WAHA
    if (body.action === 'sync') {
      const wahaContacts = await waha.fetchAllContacts();
      let createdCount = 0;

      for (const c of wahaContacts) {
        if (!c.id || c.id.endsWith('@g.us')) continue;
        const phone = sanitizePhone(c.id.replace(/@c\.us$/, ''));
        if (!phone) continue;

        await prisma.contact.upsert({
          where: { jid: c.id },
          create: {
            phone,
            jid: c.id,
            name: c.name || c.pushname || phone,
            pushName: c.pushname || null,
            isWAUser: true,
          },
          update: {
            name: c.name || undefined,
            pushName: c.pushname || undefined,
          },
        });
        createdCount++;
      }

      return NextResponse.json({ ok: true, synced: createdCount });
    }

    // Manual single contact creation
    const {
      name,
      phone: rawPhone,
      tags,
      notes,
      storeName,
      businessCategory,
      email,
      accountCreatedAt,
      address,
    } = body;
    const phone = sanitizePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: 'Nomor telepon tidak valid' }, { status: 400 });
    }

    const jid = phoneToJid(phone);

    // Check if number exists on WhatsApp via WAHA
    const check = await waha.checkNumberExists(phone);

    const contact = await prisma.contact.upsert({
      where: { jid },
      create: {
        phone,
        jid,
        name: name || storeName || phone,
        storeName: storeName || null,
        businessCategory: businessCategory || null,
        email: email || null,
        accountCreatedAt: accountCreatedAt || null,
        address: address || null,
        isWAUser: check.exists,
        tags: tags || null,
        notes: notes || null,
      },
      update: {
        name: name || undefined,
        storeName: storeName || undefined,
        businessCategory: businessCategory || undefined,
        email: email || undefined,
        accountCreatedAt: accountCreatedAt || undefined,
        address: address || undefined,
        tags: tags || undefined,
        notes: notes || undefined,
        isWAUser: check.exists,
      },
    });

    return NextResponse.json({ contact, existsOnWhatsApp: check.exists });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH update contact name / tags / merchant details
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      jid,
      name,
      tags,
      notes,
      storeName,
      businessCategory,
      email,
      accountCreatedAt,
      address,
    } = body;

    if (!jid) {
      return NextResponse.json({ error: 'jid is required' }, { status: 400 });
    }

    const contact = await prisma.contact.update({
      where: { jid },
      data: {
        name: name !== undefined ? name : undefined,
        tags: tags !== undefined ? tags : undefined,
        notes: notes !== undefined ? notes : undefined,
        storeName: storeName !== undefined ? storeName : undefined,
        businessCategory: businessCategory !== undefined ? businessCategory : undefined,
        email: email !== undefined ? email : undefined,
        accountCreatedAt: accountCreatedAt !== undefined ? accountCreatedAt : undefined,
        address: address !== undefined ? address : undefined,
      },
    });

    // Also update chat name if chat exists
    if (name) {
      await prisma.chat.updateMany({
        where: { id: jid },
        data: { name },
      });
    }

    return NextResponse.json({ ok: true, contact });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE contact
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const jid = searchParams.get('jid');
    const deleteChats = searchParams.get('deleteChats') === 'true';

    if (!id && !jid) {
      return NextResponse.json(
        { error: 'id atau jid wajib diisi' },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          ...(id ? [{ id }] : []),
          ...(jid ? [{ jid }] : []),
        ],
      },
    });

    if (!contact) {
      return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 });
    }

    if (deleteChats) {
      // Delete messages and chats associated with this contact
      await prisma.message.deleteMany({
        where: {
          OR: [
            { contactId: contact.id },
            { chatId: contact.jid },
            ...(contact.lid ? [{ chatId: contact.lid }] : []),
          ],
        },
      });

      await prisma.chat.deleteMany({
        where: {
          OR: [
            { contactId: contact.id },
            { id: contact.jid },
            ...(contact.lid ? [{ id: contact.lid }] : []),
          ],
        },
      });
    }

    await prisma.contact.delete({
      where: { id: contact.id },
    });

    await createLog(
      'AUTH',
      'SUCCESS',
      `Kontak "${contact.name || contact.phone}" (${contact.phone}) berhasil dihapus${
        deleteChats ? ' beserta obrolannya' : ''
      }`
    );

    return NextResponse.json({
      ok: true,
      message: 'Kontak berhasil dihapus',
      contactId: contact.id,
    });
  } catch (err: any) {
    console.error('Delete contact error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
