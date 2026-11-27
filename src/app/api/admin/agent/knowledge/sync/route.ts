import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUser } from '@/lib/session-user';
import {
  getKnowledgeBundlePath,
  syncAllLapaqKnowledge,
} from '@/lib/agent/knowledge-indexer';
import { hasGeminiApiKey } from '@/lib/agent/embeddings';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const grouped = await prisma.knowledgeChunk.groupBy({
    by: ['sourceType'],
    where: { isActive: true },
    _count: { _all: true },
  });

  const [vecAgg] = await prisma.$queryRawUnsafe<Array<{ total: bigint; vectorized: bigint }>>(
    `SELECT COUNT(*)::bigint AS total,
            COUNT(embedding)::bigint AS vectorized
     FROM "KnowledgeChunk"
     WHERE "isActive" = true`
  );

  let bundleMeta: { exists: boolean; generatedAt?: string; totalChunks?: number } = {
    exists: false,
  };
  try {
    const raw = JSON.parse(await fs.readFile(getKnowledgeBundlePath(), 'utf8'));
    bundleMeta = {
      exists: true,
      generatedAt: raw.generatedAt,
      totalChunks: raw.totalChunks ?? raw.chunks?.length ?? 0,
    };
  } catch {
    bundleMeta = { exists: false };
  }

  return NextResponse.json({
    totalActiveChunks: Number(vecAgg?.total || 0),
    vectorizedChunks: Number(vecAgg?.vectorized || 0),
    geminiKeyConfigured: hasGeminiApiKey(),
    bySourceType: grouped.map((g) => ({
      sourceType: g.sourceType,
      count: g._count._all,
    })),
    bundle: bundleMeta,
  });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const includeOnline = body.includeOnline !== false;
    const report = await syncAllLapaqKnowledge({ includeOnline });
    return NextResponse.json({ ok: true, report });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal menyinkronkan basis pengetahuan' },
      { status: 500 }
    );
  }
}
