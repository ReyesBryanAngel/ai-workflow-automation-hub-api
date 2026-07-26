import { env } from '../config/env.js';

// Posts an email payload to the n8n Webhook Trigger node (TASKS.md Phase 3),
// letting n8n run the full pipeline (Claude -> DB -> CRM -> Slack) rather
// than reimplementing that orchestration in Express.
export async function triggerN8nWorkflow(payload: unknown): Promise<unknown> {
  const response = await fetch(env.n8nWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook responded with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? response.json() : undefined;
}
