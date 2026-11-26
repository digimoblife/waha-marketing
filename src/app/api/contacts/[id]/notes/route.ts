import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

// GET internal team notes for a contact (default 3 latest, or ?all=true)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id;
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get('all') === 'true';

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, notes: true, updatedAt: true },
    });

    if (!contact) {
      return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 });
    }

    let total = await prisma.contactNote.count({ where: { contactId } });

    // Seamless one-time migration of legacy Contact.notes into ContactNote
    if (total === 0 && contact.notes && contact.notes.trim()) {
      await prisma.contactNote.create({
        data: {
          contactId,
          authorName: 'Catatan Sebelumnya',
          body: contact.notes.trim(),
          createdAt: contact.updatedAt,
        },
      });
      total = 1;
    }

    const notes = await prisma.contactNote.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      ...(showAll ? {} : { take: 3 }),
    });

    return NextResponse.json({ notes, total });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST add a new internal team note
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id;
    const body = await req.json();
    const text = String(body.body || '').trim();

    if (!text) {
      return NextResponse.json({ error: 'Isi catatan wajib diisi' }, { status: 400 });
    }

    const user = await getRequestUser(req);
    const authorName = user?.name || user?.username || 'Tim Marketing';

    const note = await prisma.contactNote.create({
      data: {
        contactId,
        authorId: user?.id || null,
        authorName,
        body: text,
      },
    });

    // Keep legacy contact.notes synced with latest note for backward compatibility
    await prisma.contact
      .update({
        where: { id: contactId },
        data: { notes: text },
      })
      .catch(() => null);

    return NextResponse.json({ ok: true, note });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
