import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';

export const dynamic = 'force-dynamic';

const STARTER_TEMPLATES = [
  {
    shortcut: '/salam',
    title: 'Sapaan Onboarding',
    category: 'Onboarding',
    body: 'Halo Kak {nama} dari {nama_toko} 👋, saya dari tim Lapaq. Apakah ada kendala saat setup katalog toko kategori {kategori} hari ini?',
  },
  {
    shortcut: '/followup',
    title: 'Follow Up Aktivasi',
    category: 'Follow Up',
    body: 'Selamat pagi Kak {nama} 🙏, sekadar follow up untuk aktivasi akun {nama_toko}. Jika butuh bantuan upload produk, silakan balas pesan ini ya.',
  },
  {
    shortcut: '/promo',
    title: 'Info Promo Gratis Ongkir',
    category: 'Promo',
    body: 'Halo Kak {nama}! 🎉 Minggu ini ada program gratis ongkir khusus merchant aktif {kategori}. Mau kami daftarkan untuk {nama_toko}?',
  },
  {
    shortcut: '/selesai',
    title: 'Penutup Ramah',
    category: 'CS',
    body: 'Terima kasih banyak Kak {nama} 🙏. Kalau ada pertanyaan lain seputar {nama_toko}, langsung chat ke nomor ini saja ya!',
  },
];

export async function GET() {
  try {
    let templates = await prisma.messageTemplate.findMany({
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });

    if (templates.length === 0) {
      for (const tpl of STARTER_TEMPLATES) {
        await prisma.messageTemplate
          .upsert({
            where: { shortcut: tpl.shortcut },
            create: tpl,
            update: {},
          })
          .catch(() => null);
      }
      templates = await prisma.messageTemplate.findMany({
        orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      });
    }

    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let shortcut = String(body.shortcut || '').trim().toLowerCase().replace(/\s+/g, '');
    const title = String(body.title || '').trim();
    const category = String(body.category || 'Umum').trim();
    const text = String(body.body || '').trim();

    if (!shortcut || !title || !text) {
      return NextResponse.json(
        { error: 'Shortcut, judul, dan isi pesan wajib diisi' },
        { status: 400 }
      );
    }

    if (!shortcut.startsWith('/')) {
      shortcut = `/${shortcut}`;
    }

    const user = await getRequestUser(req);
    const existing = await prisma.messageTemplate.findUnique({ where: { shortcut } });
    if (existing) {
      return NextResponse.json(
        { error: `Shortcut "${shortcut}" sudah digunakan` },
        { status: 400 }
      );
    }

    const template = await prisma.messageTemplate.create({
      data: {
        shortcut,
        title,
        category,
        body: text,
        createdById: user?.id || null,
      },
    });

    return NextResponse.json({ ok: true, template });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 });
    }

    const data: any = {};
    if (body.shortcut !== undefined) {
      let sc = String(body.shortcut).trim().toLowerCase().replace(/\s+/g, '');
      if (sc && !sc.startsWith('/')) sc = `/${sc}`;
      data.shortcut = sc;
    }
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.category !== undefined) data.category = String(body.category).trim();
    if (body.body !== undefined) data.body = String(body.body).trim();

    const template = await prisma.messageTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, template });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 });
    }

    await prisma.messageTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
