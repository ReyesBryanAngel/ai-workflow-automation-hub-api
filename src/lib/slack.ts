import { env } from '../config/env.js';
import { logger } from './logger.js';

// Posts to a Slack incoming webhook. Kept endpoint-agnostic (plain `text`)
// since this project only needs a single notification shape today.
export async function sendSlackNotification(text: string): Promise<void> {
  if (!env.slackWebhookUrl) {
    logger.warn('SLACK_WEBHOOK_URL not configured, skipping Slack notification');
    return;
  }

  const response = await fetch(env.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook responded with ${response.status}`);
  }
}
