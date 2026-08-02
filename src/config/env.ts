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
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3Region: requireEnv('S3_REGION', 'us-east-1'),
  s3Bucket: process.env.S3_BUCKET ?? '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  llamaParseApiKey: process.env.LLAMAPARSE_API_KEY ?? '',
  // Phase 9.4 risk rules: invoices at/above this total are flagged
  // NEEDS_REVIEW regardless of clean vendor/PO matches, and invoice totals
  // are allowed to diverge from their matched PO amount by this fraction
  // (0.05 = 5%) before an amount-mismatch exception fires.
  invoiceRiskAmountThreshold: Number(requireEnv('INVOICE_RISK_AMOUNT_THRESHOLD', '10000')),
  invoicePoTolerancePercent: Number(requireEnv('INVOICE_PO_TOLERANCE_PERCENT', '0.05')),
};
