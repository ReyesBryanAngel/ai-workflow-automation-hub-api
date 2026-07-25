import { Router } from 'express';

import { sendSlackNotification } from '../lib/slack.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { slackNotificationSchema, type SlackNotificationInput } from '../schemas/notifications.schema.js';
import { AppError } from '../utils/AppError.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.post('/slack', validate(slackNotificationSchema), async (req, res) => {
  const { message } = req.body as SlackNotificationInput;

  try {
    await sendSlackNotification(message);
  } catch (error) {
    throw new AppError(
      'Failed to send Slack notification',
      502,
      error instanceof Error ? error.message : undefined,
    );
  }

  res.status(200).json({ status: 'sent' });
});
