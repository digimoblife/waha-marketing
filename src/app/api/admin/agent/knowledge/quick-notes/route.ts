import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';
import { sanitizeKnowledgeText } from '@/lib/agent/knowledge-sanitizer';
import { upsertAndEmbedKnowledgeChunk } from '@/lib/agent/knowledge-indexer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const notes = await prisma.knowledgeChunk.findMany({
    where: { sourceType: 'QUICK_NOTE', isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      sourceKey: true,
      title: true,
      category: true,
      content: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const title = sanitizeKnowledgeText(String(body.title || '')).slice(0, 150);
    const category =
      sanitizeKnowledgeText(String(body.category || 'Pengumuman')).slice(0, 50) ||
      'Pengumuman';
    const content = sanitizeKnowledgeText(String(body.content || '')).slice(0, 4000);

    if (!title || !content) {
      return NextResponse.json({ error: 'Judul dan isi catatan wajib diisi' }, { status: 400 });
    }

    const sourceKey =
      body.sourceKey && String(body.sourceKey).startsWith('quick:')
        ? String(body.sourceKey)
        : `quick:${Date.now()}`;

    await upsertAndEmbedKnowledgeChunk({
      sourceType: 'QUICK_NOTE',
      sourceKey,
      title,
      category,
      content,
      structuredMeta: { authorName: user?.name || 'Admin', updatedAt: new Date().toISOString() },
    });

    const saved = await prisma.knowledgeChunk.findUnique({
      where: { sourceKey },
      select: {
        id: true,
        sourceKey: true,
        title: true,
        category: true,
        content: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, note: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gagal menyimpan catatan' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID wajib diisi' }, { status: 400 });
  }

  await prisma.knowledgeChunk.deleteMany({
    where: { id, sourceType: 'QUICK_NOTE' },
  });

  return NextResponse.json({ ok: true });
}
