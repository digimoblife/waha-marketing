import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';
import {
  computeContentHash,
  containsForbiddenInternalTerm,
  containsOrphanRoute,
  sanitizeKnowledgeText,
} from './knowledge-sanitizer';
import { embedText768, formatPgVectorLiteral, hasGeminiApiKey } from './embeddings';

export interface RawBundleChunk {
  sourceType: string;
  sourceKey: string;
  title: string;
  category?: string;
  content: string;
  structuredMeta?: Record<string, unknown> | null;
}

export interface KnowledgeBundlePayload {
  version: number;
  generatedAt?: string;
  totalChunks?: number;
  chunks: RawBundleChunk[];
}

export interface SyncReport {
  bundleLoaded: number;
  onlineTutorialsFetched: number;
  upserted: number;
  embeddedCount: number;
  skippedUnchanged: number;
  geminiKeyPresent: boolean;
  warnings: string[];
}

const CS_API_BASE = process.env.LAPAQ_CS_PUBLIC_URL || 'https://cs.lapaq.id';
const BANTUAN_SITE_BASE = process.env.LAPAQ_BANTUAN_PUBLIC_URL || 'https://bantuan.lapaq.id';
const BUNDLE_FILE_PATH = path.join(process.cwd(), 'data', 'lapaq-knowledge-bundle.json');

export function getKnowledgeBundlePath(): string {
  return BUNDLE_FILE_PATH;
}

/**
 * Validates and sanitizes an incoming knowledge bundle JSON before saving or indexing.
 */
export function normalizeAndValidateBundle(raw: unknown): KnowledgeBundlePayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Format JSON bundle tidak valid.');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.chunks)) {
    throw new Error('Bundle wajib memiliki array "chunks".');
  }

  const cleanChunks: RawBundleChunk[] = [];
  for (const item of obj.chunks) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const sourceKey = String(c.sourceKey || '').trim();
    const rawTitle = String(c.title || '').trim();
    const rawContent = String(c.content || '').trim();
    if (!sourceKey || !rawTitle || !rawContent) continue;
    if (containsOrphanRoute(sourceKey) || containsOrphanRoute(rawTitle)) continue;

    const cleanTitle = sanitizeKnowledgeText(rawTitle);
    const cleanContent = sanitizeKnowledgeText(rawContent);
    if (!cleanTitle || !cleanContent) continue;

    if (containsForbiddenInternalTerm(cleanTitle) || containsForbiddenInternalTerm(cleanContent)) {
      throw new Error(`Terdeteksi istilah internal terlarang pada chunk "${sourceKey}".`);
    }

    cleanChunks.push({
      sourceType: String(c.sourceType || 'REPO_BUNDLE').trim(),
      sourceKey,
      title: cleanTitle,
      category: sanitizeKnowledgeText(String(c.category || 'Umum')) || 'Umum',
      content: cleanContent,
      structuredMeta:
        c.structuredMeta && typeof c.structuredMeta === 'object'
          ? (c.structuredMeta as Record<string, unknown>)
          : null,
    });
  }

  return {
    version: Number(obj.version || 1),
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : new Date().toISOString(),
    totalChunks: cleanChunks.length,
    chunks: cleanChunks,
  };
}

/**
 * Fetches all published tutorials from cs.lapaq.id/v1/help/catalog and /v1/help/tutorials/<slug>
 */
async function fetchOnlineTutorialsFromLapaqCs(warnings: string[]): Promise<RawBundleChunk[]> {
  const results: RawBundleChunk[] = [];
  try {
    const catRes = await fetch(`${CS_API_BASE}/v1/help/catalog`, {
      headers: { Accept: 'application/json', Origin: BANTUAN_SITE_BASE },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (!catRes.ok) {
      warnings.push(`Katalog online cs.lapaq.id mengembalikan HTTP ${catRes.status}`);
      return results;
    }

    const catalog = (await catRes.json()) as {
      tutorials?: Array<{ slug?: string; id?: string; title?: string; category?: string }>;
      categories?: Array<{ id?: string; label?: string; tutorials?: Array<{ slug?: string }> }>;
    };

    const slugs = new Set<string>();
    if (Array.isArray(catalog.tutorials)) {
      for (const t of catalog.tutorials) {
        if (t?.slug) slugs.add(String(t.slug));
      }
    }
    if (Array.isArray(catalog.categories)) {
      for (const cat of catalog.categories) {
        if (Array.isArray(cat.tutorials)) {
          for (const t of cat.tutorials) {
            if (t?.slug) slugs.add(String(t.slug));
          }
        }
      }
    }

    for (const slug of Array.from(slugs)) {
      try {
        const tutRes = await fetch(`${CS_API_BASE}/v1/help/tutorials/${encodeURIComponent(slug)}`, {
          headers: { Accept: 'application/json', Origin: BANTUAN_SITE_BASE },
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        });
        if (!tutRes.ok) continue;
        const rawTut = (await tutRes.json()) as Record<string, unknown>;
        const tut = (rawTut.tutorial && typeof rawTut.tutorial === 'object'
          ? rawTut.tutorial
          : rawTut) as Record<string, unknown>;

        const title = sanitizeKnowledgeText(String(tut.title || slug));
        const summary = sanitizeKnowledgeText(String(tut.summary || ''));
        const category = sanitizeKnowledgeText(String(tut.category || 'panduan')) || 'panduan';
        const stepsArr = Array.isArray(tut.steps) ? tut.steps : [];
        const reqArr = Array.isArray(tut.requires) ? tut.requires : [];
        const tipsArr = Array.isArray(tut.tips) ? tut.tips : [];

        const formattedSteps = stepsArr
          .map((s: any, idx: number) => {
            const stTitle = sanitizeKnowledgeText(String(s?.title || `Langkah ${idx + 1}`));
            const stText = sanitizeKnowledgeText(String(s?.text || ''));
            const stNote = s?.note ? ` (Catatan: ${sanitizeKnowledgeText(String(s.note))})` : '';
            return `${idx + 1}. ${stTitle}: ${stText}${stNote}`;
          })
          .filter(Boolean);

        const fullText = sanitizeKnowledgeText(
          `Panduan Resmi Lapaq: ${title}\n` +
            (summary ? `Ringkasan: ${summary}\n` : '') +
            (reqArr.length > 0
              ? `Syarat Sebelum Mulai: ${reqArr.map((r) => sanitizeKnowledgeText(String(r))).join('; ')}\n`
              : '') +
            (formattedSteps.length > 0 ? `Langkah-langkah:\n${formattedSteps.join('\n')}\n` : '') +
            (tipsArr.length > 0
              ? `Tips Penting: ${tipsArr.map((t) => sanitizeKnowledgeText(String(t))).join(' | ')}`
              : '')
        );

        if (!fullText || containsOrphanRoute(fullText)) continue;

        results.push({
          sourceType: 'TUTORIAL',
          sourceKey: `tutorial:${slug}`,
          title,
          category,
          content: fullText,
          structuredMeta: {
            slug,
            helpUrl: `${BANTUAN_SITE_BASE}/tutorial/${slug}/`,
            stepCount: stepsArr.length,
            steps: stepsArr.map((s: any, i: number) => ({
              step: i + 1,
              title: sanitizeKnowledgeText(String(s?.title || `Langkah ${i + 1}`)),
              text: sanitizeKnowledgeText(String(s?.text || '')),
              note: s?.note ? sanitizeKnowledgeText(String(s.note)) : undefined,
            })),
          },
        });
      } catch {
        warnings.push(`Gagal mengambil detail tutorial "${slug}"`);
      }
    }
  } catch (err: any) {
    warnings.push(`Sinkronisasi online cs.lapaq.id dilewati: ${err?.message || 'offline'}`);
  }

  return results;
}

/**
 * Upserts a single sanitized chunk into KnowledgeChunk and embeds it if content changed or embedding is missing.
 */
export async function upsertAndEmbedKnowledgeChunk(
  chunk: RawBundleChunk
): Promise<{ changed: boolean; embedded: boolean }> {
  const cleanTitle = sanitizeKnowledgeText(chunk.title);
  const cleanContent = sanitizeKnowledgeText(chunk.content);
  const hash = computeContentHash(`${cleanTitle}\n${cleanContent}`);
  const metaStr = chunk.structuredMeta ? JSON.stringify(chunk.structuredMeta) : null;

  const existingRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; contentHash: string; hasEmbedding: boolean }>
  >(
    `SELECT id, "contentHash", (embedding IS NOT NULL) AS "hasEmbedding"
     FROM "KnowledgeChunk"
     WHERE "sourceKey" = $1
     LIMIT 1`,
    chunk.sourceKey
  );
  const existing = existingRows[0];

  const changed = !existing || existing.contentHash !== hash;

  const saved = await prisma.knowledgeChunk.upsert({
    where: { sourceKey: chunk.sourceKey },
    create: {
      sourceType: chunk.sourceType,
      sourceKey: chunk.sourceKey,
      title: cleanTitle,
      category: chunk.category || 'Umum',
      content: cleanContent,
      structuredMeta: metaStr,
      contentHash: hash,
      isActive: true,
    },
    update: {
      sourceType: chunk.sourceType,
      title: cleanTitle,
      category: chunk.category || 'Umum',
      content: cleanContent,
      structuredMeta: metaStr,
      contentHash: hash,
      isActive: true,
    },
  });

  const needsEmbedding = changed || !existing?.hasEmbedding;
  if (needsEmbedding && hasGeminiApiKey()) {
    try {
      const vec = await embedText768(`${cleanTitle}\n\n${cleanContent}`);
      if (vec) {
        await prisma.$executeRawUnsafe(
          `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
          formatPgVectorLiteral(vec),
          saved.id
        );
        return { changed, embedded: true };
      }
    } catch (err) {
      console.warn(`[KnowledgeIndexer] Embedding skipped for ${chunk.sourceKey}:`, err);
    }
  }

  return { changed, embedded: false };
}

/**
 * Synchronizes portable bundle + online cs.lapaq.id tutorials into PostgreSQL + pgvector.
 */
export async function syncAllLapaqKnowledge(options?: {
  includeOnline?: boolean;
}): Promise<SyncReport> {
  const includeOnline = options?.includeOnline !== false;
  const warnings: string[] = [];
  const allChunks = new Map<string, RawBundleChunk>();

  // 1. Load local/uploaded portable bundle (data/lapaq-knowledge-bundle.json)
  let bundleLoaded = 0;
  try {
    const rawJson = await fs.readFile(BUNDLE_FILE_PATH, 'utf8');
    const validated = normalizeAndValidateBundle(JSON.parse(rawJson));
    for (const ch of validated.chunks) {
      allChunks.set(ch.sourceKey, ch);
    }
    bundleLoaded = validated.chunks.length;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      warnings.push(`Gagal membaca lapaq-knowledge-bundle.json: ${err?.message}`);
    } else {
      warnings.push('File data/lapaq-knowledge-bundle.json belum ada.');
    }
  }

  // 2. Fetch live tutorials from cs.lapaq.id
  let onlineTutorialsFetched = 0;
  if (includeOnline) {
    const onlineChunks = await fetchOnlineTutorialsFromLapaqCs(warnings);
    onlineTutorialsFetched = onlineChunks.length;
    for (const ch of onlineChunks) {
      allChunks.set(ch.sourceKey, ch);
    }
  }

  let upserted = 0;
  let embeddedCount = 0;
  let skippedUnchanged = 0;

  for (const chunk of Array.from(allChunks.values())) {
    const res = await upsertAndEmbedKnowledgeChunk(chunk);
    if (res.changed) upserted++;
    else skippedUnchanged++;
    if (res.embedded) embeddedCount++;
  }

  await createLog(
    'AGENT',
    'SUCCESS',
    `Knowledge Sync selesai: ${bundleLoaded} bundle, ${onlineTutorialsFetched} online tutorial, ${upserted} diperbarui, ${embeddedCount} di-embed`,
    { bundleLoaded, onlineTutorialsFetched, upserted, embeddedCount, skippedUnchanged, warnings }
  );

  return {
    bundleLoaded,
    onlineTutorialsFetched,
    upserted,
    embeddedCount,
    skippedUnchanged,
    geminiKeyPresent: hasGeminiApiKey(),
    warnings,
  };
}

export interface RetrievedKnowledgeItem {
  id: string;
  sourceType: string;
  sourceKey: string;
  title: string;
  category: string;
  content: string;
  structuredMeta: Record<string, unknown> | null;
  distance?: number;
}

/**
 * Hybrid Semantic + Keyword Retrieval over KnowledgeChunk.
 * Uses pgvector HNSW cosine distance when GEMINI_API_KEY is available, with automatic keyword fallback.
 */
export async function searchKnowledgeBase(
  query: string,
  topK = 5
): Promise<RetrievedKnowledgeItem[]> {
  const safeLimit = Math.max(1, Math.min(15, topK));
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  if (hasGeminiApiKey()) {
    try {
      const qVec = await embedText768(cleanQuery);
      if (qVec) {
        const rows = await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            sourceType: string;
            sourceKey: string;
            title: string;
            category: string;
            content: string;
            structuredMeta: string | null;
            distance: number;
          }>
        >(
          `SELECT id, "sourceType", "sourceKey", title, category, content, "structuredMeta",
                  (embedding <=> $1::vector) AS distance
           FROM "KnowledgeChunk"
           WHERE "isActive" = true AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector ASC
           LIMIT $2`,
          formatPgVectorLiteral(qVec),
          safeLimit
        );

        if (rows.length > 0) {
          return rows.map((r) => ({
            ...r,
            distance: Number(r.distance),
            structuredMeta: r.structuredMeta ? JSON.parse(r.structuredMeta) : null,
          }));
        }
      }
    } catch (err) {
      console.warn('[KnowledgeIndexer] Vector search fallback to keyword search:', err);
    }
  }

  // Keyword scoring fallback when running without GEMINI_API_KEY or before initial vectorization
  const tokens = cleanQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 8);

  if (tokens.length === 0) return [];

  const candidates = await prisma.knowledgeChunk.findMany({
    where: {
      isActive: true,
      OR: tokens.flatMap((tok) => [
        { title: { contains: tok, mode: 'insensitive' } },
        { content: { contains: tok, mode: 'insensitive' } },
      ]),
    },
    take: 40,
  });

  const scored = candidates
    .map((c) => {
      const hayTitle = c.title.toLowerCase();
      const hayBody = c.content.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (hayTitle.includes(tok)) score += 3;
        if (hayBody.includes(tok)) score += 1;
      }
      return { item: c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);

  return scored.map(({ item }) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceKey: item.sourceKey,
    title: item.title,
    category: item.category,
    content: item.content,
    structuredMeta: item.structuredMeta ? JSON.parse(item.structuredMeta) : null,
  }));
}

export interface RetrievedCaseMemory {
  id: string;
  title: string;
  symptomPattern: string;
  rootCause: string;
  verifiedSolution: string;
  applicability: string;
  distance?: number;
}

/**
 * Searches verified past resolutions in CaseMemory using pgvector cosine similarity + keyword fallback.
 */
export async function searchCaseMemory(
  symptomQuery: string,
  topK = 3
): Promise<RetrievedCaseMemory[]> {
  const safeLimit = Math.max(1, Math.min(10, topK));
  const cleanQuery = symptomQuery.trim();
  if (!cleanQuery) return [];

  if (hasGeminiApiKey()) {
    try {
      const qVec = await embedText768(cleanQuery);
      if (qVec) {
        const rows = await prisma.$queryRawUnsafe<
          Array<RetrievedCaseMemory & { distance: number }>
        >(
          `SELECT id, title, "symptomPattern", "rootCause", "verifiedSolution", applicability,
                  (embedding <=> $1::vector) AS distance
           FROM "CaseMemory"
           WHERE "isActive" = true
             AND applicability = 'PERMANENT'
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector ASC
           LIMIT $2`,
          formatPgVectorLiteral(qVec),
          safeLimit
        );

        const relevant = rows.filter((r) => Number(r.distance) <= 0.45);
        if (relevant.length > 0) {
          return relevant.map((r) => ({ ...r, distance: Number(r.distance) }));
        }
      }
    } catch (err) {
      console.warn('[CaseMemory] Vector search fallback to keyword:', err);
    }
  }

  const stopWords = new Set(['gagal', 'error', 'tidak', 'bisa', 'kenapa', 'produk', 'toko', 'saya', 'kakak', 'cara']);
  const rawTokens = cleanQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const specificTokens = rawTokens.filter((t) => !stopWords.has(t)).slice(0, 8);
  const searchTokens = (specificTokens.length > 0 ? specificTokens : rawTokens).slice(0, 6);

  if (searchTokens.length === 0) return [];

  const candidates = await prisma.caseMemory.findMany({
    where: {
      isActive: true,
      applicability: 'PERMANENT',
      OR: searchTokens.flatMap((tok) => [
        { title: { contains: tok, mode: 'insensitive' } },
        { symptomPattern: { contains: tok, mode: 'insensitive' } },
      ]),
    },
    take: 25,
  });

  const minRequiredHits = Math.max(1, Math.ceil(searchTokens.length * 0.6));
  return candidates
    .map((c) => {
      const hay = `${c.title} ${c.symptomPattern}`.toLowerCase();
      const matchedCount = searchTokens.filter((tok) => hay.includes(tok)).length;
      return { item: c, matchedCount };
    })
    .filter((x) => x.matchedCount >= minRequiredHits)
    .sort((a, b) => b.matchedCount - a.matchedCount)
    .slice(0, safeLimit)
    .map((x) => x.item);
}
