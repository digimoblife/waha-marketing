import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[pgvector] Ensuring vector extension and HNSW cosine indexes...');
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw_idx
    ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS case_memory_embedding_hnsw_idx
    ON "CaseMemory" USING hnsw (embedding vector_cosine_ops);
  `);
  console.log('[pgvector] Extension and HNSW indexes ready.');
}

main()
  .catch((err) => {
    console.error('[pgvector] Failed setting up indexes:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
