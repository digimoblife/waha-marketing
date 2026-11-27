import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/session-user';
import {
  getKnowledgeBundlePath,
  normalizeAndValidateBundle,
  upsertAndEmbedKnowledgeChunk,
} from '@/lib/agent/knowledge-indexer';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (user && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let rawPayload: unknown;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof (file as Blob).text !== 'function') {
        return NextResponse.json({ error: 'File JSON tidak ditemukan' }, { status: 400 });
      }
      const text = await (file as Blob).text();
      if (text.length > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Ukuran file bundle melebihi batas 5 MB' }, { status: 400 });
      }
      rawPayload = JSON.parse(text);
    } else {
      rawPayload = await req.json();
    }

    const validated = normalizeAndValidateBundle(rawPayload);
    const bundlePath = getKnowledgeBundlePath();
    await fs.mkdir(path.dirname(bundlePath), { recursive: true });
    await fs.writeFile(bundlePath, JSON.stringify(validated, null, 2), 'utf8');

    let upserted = 0;
    let embeddedCount = 0;
    for (const chunk of validated.chunks) {
      const res = await upsertAndEmbedKnowledgeChunk(chunk);
      if (res.changed) upserted++;
      if (res.embedded) embeddedCount++;
    }

    await createLog(
      'AGENT',
      'SUCCESS',
      `Admin ${user?.name || 'Admin'} mengunggah lapaq-knowledge-bundle.json (${validated.chunks.length} item, ${upserted} diperbarui)`,
      { totalChunks: validated.chunks.length, upserted, embeddedCount }
    );

    return NextResponse.json({
      ok: true,
      totalChunks: validated.chunks.length,
      upserted,
      embeddedCount,
      generatedAt: validated.generatedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Gagal memproses file bundle pengetahuan' },
      { status: 400 }
    );
  }
}
