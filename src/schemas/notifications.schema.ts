import { z } from 'zod';

export const slackNotificationSchema = z.object({
  message: z.string().min(1),
});

export type SlackNotificationInput = z.infer<typeof slackNotificationSchema>;
