import type { EmailCategory } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';

export interface RetrievedArticle {
  id: number;
  title: string;
  content: string;
}

const DEFAULT_LIMIT = 3;

// Basic (lexical) RAG retrieval for grounding POST /api/ai/reply drafts:
// Postgres full-text search (tsvector/ts_rank) over title+content, boosted
// by an exact match against the email's classified category. This is
// keyword-based ranking, not embeddings/vector search — sufficient to
// ground replies in real KB content without adding a new external
// dependency (an embeddings provider, pgvector).
export async function searchArticles(params: {
  category: EmailCategory;
  query: string;
  limit?: number;
}): Promise<RetrievedArticle[]> {
  const { category, query, limit = DEFAULT_LIMIT } = params;

  const matches = await prisma.$queryRaw<RetrievedArticle[]>`
    SELECT id, title, content
    FROM knowledge_articles
    WHERE to_tsvector('english', title || ' ' || content)
          @@ plainto_tsquery('english', ${query})
    ORDER BY
      CASE
        WHEN category = ${category}::"EmailCategory" THEN 0
        WHEN category IS NULL THEN 1
        ELSE 2
      END,
      ts_rank(
        to_tsvector('english', title || ' ' || content),
        plainto_tsquery('english', ${query})
      ) DESC
    LIMIT ${limit}
  `;

  if (matches.length > 0) return matches;

  // No lexical match at all (sparse/unusual phrasing) — still surface the
  // most relevant category-tagged articles rather than grounding on nothing.
  return prisma.$queryRaw<RetrievedArticle[]>`
    SELECT id, title, content
    FROM knowledge_articles
    WHERE category = ${category}::"EmailCategory" OR category IS NULL
    ORDER BY category = ${category}::"EmailCategory" DESC, "createdAt" DESC
    LIMIT ${limit}
  `;
}
