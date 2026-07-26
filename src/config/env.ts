import 'dotenv/config';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: requireEnv('NODE_ENV', 'development'),
  port: Number(requireEnv('PORT', '4000')),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: requireEnv('JWT_EXPIRES_IN', '1d'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? '587'),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
  adminEmail: requireEnv('ADMIN_EMAIL', 'admin@example.com'),
  adminPassword: requireEnv('ADMIN_PASSWORD', 'change-me-please'),
};
