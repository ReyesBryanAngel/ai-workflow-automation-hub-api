import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

// Keys used to look up rows in prompt_templates. Each corresponds 1:1 with a
// hardcoded default exported from the matching file in src/prompts.
export const PromptTemplateKey = {
  EMAIL_ANALYSIS_SYSTEM: 'email_analysis_system',
  EMAIL_REPLY_SYSTEM: 'email_reply_system',
} as const;

export type PromptTemplateKey = (typeof PromptTemplateKey)[keyof typeof PromptTemplateKey];

// Prompt content is re-read from the DB on a short TTL instead of once at
// boot, so edits made via prompt_templates (Module 5 Settings) take effect
// within seconds without a redeploy — while still sparing every /api/ai
// request a DB round trip on the hot path.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { content: string; expiresAt: number }>();

// Resolves a prompt template's active content, falling back to the
// hardcoded default when no DB override exists, the override is disabled,
// or the DB is unreachable. A lookup failure must never block AI analysis
// over a Settings-table read.
export async function resolvePromptTemplate(
  key: PromptTemplateKey,
  fallback: string,
): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.content;
  }

  let content = fallback;
  try {
    const template = await prisma.promptTemplate.findUnique({ where: { key } });
    if (template?.isActive) {
      content = template.content;
    }
  } catch (error) {
    logger.warn({ err: error, key }, 'Failed to load prompt template from DB, using built-in default');
  }

  cache.set(key, { content, expiresAt: Date.now() + CACHE_TTL_MS });
  return content;
}
