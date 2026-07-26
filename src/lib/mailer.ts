import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';

let transporter: Transporter | undefined;

// Lazy singleton so a missing SMTP config only breaks the send path (POST
// /api/ai/reply with `send: true`), not app startup — drafting a reply
// without sending it must keep working with no SMTP setup at all.
function getTransporter(): Transporter {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    throw new Error('SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS)');
  }

  transporter ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });

  return transporter;
}

export async function sendReplyEmail(params: { to: string; subject: string; body: string }): Promise<void> {
  const { to, subject, body } = params;

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text: body,
  });
}
