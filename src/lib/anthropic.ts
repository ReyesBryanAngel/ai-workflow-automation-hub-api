import Anthropic from '@anthropic-ai/sdk';

import { env } from '../config/env.js';

export const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

// Opus 4.8 is the default per Anthropic guidance; downgrade only if the
// classification workload's cost/latency profile calls for it (e.g. Haiku 4.5).
export const ANTHROPIC_MODEL = 'claude-opus-4-8';

// Per-request timeout and retry budget for Claude calls. The SDK retries
// 408/409/429/5xx and connection errors on its own — this just sets the
// ceiling. Kept small since these calls sit inline in a request/response cycle.
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 30_000;
export const ANTHROPIC_MAX_RETRIES = 2;
