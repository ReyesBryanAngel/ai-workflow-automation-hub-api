import { z } from 'zod';

import { EmailCategory, Priority } from '../generated/prisma/enums.js';

export const emailAnalysisSchema = z.object({
  customerName: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  issueSummary: z.string(),
  requestedAction: z.string(),
  category: z.enum(EmailCategory),
  priority: z.enum(Priority),
  summary: z.string(),
});

export type EmailAnalysis = z.infer<typeof emailAnalysisSchema>;

export const analyzeEmailInputSchema = z.object({
  sender: z.email(),
  // The From header's display name (e.g. "Bry Reyes" from `Bry Reyes
  // <reyesangelbryan@gmail.com>`), when the mail client/n8n provides one.
  // `sender` above is deliberately the bare address only (validated as an
  // email), so this is the one place a real customer name reaches the model
  // when the body/signature itself doesn't state one.
  senderName: z.string().trim().min(1).optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  // Present when the email already has a DB row (e.g. re-analysis) so the
  // failure log below can be tied back to it. Absent for first-pass analysis,
  // which per the n8n pipeline runs before the email is persisted.
  emailId: z.coerce.number().int().positive().optional(),
});

export type AnalyzeEmailInput = z.infer<typeof analyzeEmailInputSchema>;

export const emailReplyInputSchema = emailAnalysisSchema.extend({
  sender: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  emailId: z.coerce.number().int().positive().optional(),
});

export type EmailReplyInput = z.infer<typeof emailReplyInputSchema>;

export const emailReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type EmailReply = z.infer<typeof emailReplySchema>;
