import { GoogleGenAI } from '@google/genai';
import { getWorkspaceSettings } from '@/lib/settings';

export const VECTOR_DIMENSIONS = 768;

let cachedClient: { key: string; ai: GoogleGenAI } | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  if (cachedClient && cachedClient.key === apiKey) {
    return cachedClient.ai;
  }
  const ai = new GoogleGenAI({ apiKey });
  cachedClient = { key: apiKey, ai };
  return ai;
}

export function hasGeminiApiKey(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

/**
 * Generates a normalized 768-dimensional vector using Google's Gemini Embedding model
 * (Matryoshka Representation Learning scaled to 768 dimensions for fast HNSW cosine indexing).
 * Returns null gracefully when GEMINI_API_KEY is not configured yet.
 */
export async function embedText768(text: string): Promise<number[] | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const settings = await getWorkspaceSettings();
  const model = settings.agentConfig.embeddingModel || 'gemini-embedding-2';

  const res = await ai.models.embedContent({
    model,
    contents: trimmed,
    config: {
      outputDimensionality: VECTOR_DIMENSIONS,
    },
  });

  const values = res.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length !== VECTOR_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimension from ${model}: expected ${VECTOR_DIMENSIONS}, got ${values?.length ?? 0}`
    );
  }

  // L2-normalize when using MRL sub-dimensions so cosine distance is maximally accurate
  let normSq = 0;
  for (const v of values) normSq += v * v;
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    return values.map((v) => Number((v / norm).toFixed(7)));
  }
  return values;
}

export function formatPgVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
