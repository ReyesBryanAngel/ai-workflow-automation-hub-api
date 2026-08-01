import { env } from '../src/config/env.js';
import { EmailCategory } from '../src/generated/prisma/enums.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_EMAIL_ANALYSIS_SYSTEM_PROMPT } from '../src/prompts/emailAnalysis.prompt.js';
import { DEFAULT_EMAIL_REPLY_SYSTEM_PROMPT } from '../src/prompts/emailReply.prompt.js';
import { DEFAULT_INVOICE_EXTRACTION_SYSTEM_PROMPT } from '../src/prompts/invoiceExtraction.prompt.js';
import { PromptTemplateKey } from '../src/services/promptTemplate.service.js';

// Seed knowledge base content used to ground POST /api/ai/reply drafts (see
// knowledgeBase.service.ts). Tagged with the same EmailCategory enum as
// emails so retrieval can boost on an exact category match.
const KNOWLEDGE_ARTICLES: {
  title: string;
  content: string;
  category?: EmailCategory;
}[] = [
  {
    title: 'Refund Policy',
    content:
      'Customers may request a full refund within 30 days of purchase, no questions asked. Refunds are processed to the original payment method within 5-7 business days. After 30 days, refunds are only issued at the discretion of a support lead for verified product defects.',
    category: EmailCategory.BILLING,
  },
  {
    title: 'Billing Cycle & Invoices',
    content:
      'Subscriptions are billed monthly on the anniversary of the signup date. Invoices are emailed automatically on the billing date and are also available for download from the account billing page. Failed payments are retried 3 times over 7 days before a subscription is paused.',
    category: EmailCategory.BILLING,
  },
  {
    title: 'Password Reset Steps',
    content:
      'To reset a password, go to the login page and select "Forgot password". A reset link is emailed and expires after 60 minutes. If the email does not arrive within a few minutes, check spam, then contact support to have a reset link issued manually.',
    category: EmailCategory.SUPPORT,
  },
  {
    title: 'Enterprise Pricing Tiers',
    content:
      'Enterprise plans start at 500 seats and include a dedicated account manager, SSO/SAML, and a 99.9% uptime SLA. Pricing is volume-based and quoted directly by the sales team; standard self-serve plans (Starter/Pro) are listed on the public pricing page and do not require a custom quote.',
    category: EmailCategory.SALES,
  },
  {
    title: 'Support SLA & Response Times',
    content:
      'Critical-priority issues (production outage, security exposure) receive an initial response within 1 hour, 24/7. High-priority issues are responded to within 4 business hours. Medium and low priority requests are responded to within 1-2 business days.',
    category: EmailCategory.COMPLAINT,
  },
  {
    title: 'Unsolicited Email Policy',
    content:
      'The support team does not respond substantively to unsolicited marketing, phishing attempts, or automated spam. Such messages are acknowledged briefly if at all and are not escalated.',
    category: EmailCategory.SPAM,
  },
];

async function main() {
  const passwordHash = await hashPassword(env.adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: env.adminEmail },
    update: { passwordHash },
    create: { email: env.adminEmail, passwordHash },
  });

  console.log(`Seeded admin user: ${admin.email}`);

  // `update: {}` intentionally leaves an existing row untouched so a reseed
  // never clobbers a prompt an admin already edited via Module 5 Settings.
  await prisma.promptTemplate.upsert({
    where: { key: PromptTemplateKey.EMAIL_ANALYSIS_SYSTEM },
    update: {},
    create: {
      key: PromptTemplateKey.EMAIL_ANALYSIS_SYSTEM,
      description: 'System prompt for POST /api/ai/analyze (email classification + extraction)',
      content: DEFAULT_EMAIL_ANALYSIS_SYSTEM_PROMPT,
    },
  });

  await prisma.promptTemplate.upsert({
    where: { key: PromptTemplateKey.EMAIL_REPLY_SYSTEM },
    update: {},
    create: {
      key: PromptTemplateKey.EMAIL_REPLY_SYSTEM,
      description: 'System prompt for POST /api/ai/reply (drafted response)',
      content: DEFAULT_EMAIL_REPLY_SYSTEM_PROMPT,
    },
  });

  await prisma.promptTemplate.upsert({
    where: { key: PromptTemplateKey.INVOICE_EXTRACTION_SYSTEM },
    update: {},
    create: {
      key: PromptTemplateKey.INVOICE_EXTRACTION_SYSTEM,
      description:
        'System prompt for invoice field extraction (LlamaParse text + Claude PDF fallback)',
      content: DEFAULT_INVOICE_EXTRACTION_SYSTEM_PROMPT,
    },
  });

  console.log(
    'Seeded prompt templates: email_analysis_system, email_reply_system, invoice_extraction_system',
  );

  // `title` has no unique constraint, so this finds-then-creates rather than
  // upserting, so reseeding doesn't duplicate rows.
  for (const article of KNOWLEDGE_ARTICLES) {
    const existing = await prisma.knowledgeArticle.findFirst({ where: { title: article.title } });
    if (!existing) {
      await prisma.knowledgeArticle.create({ data: article });
    }
  }

  console.log(`Seeded ${KNOWLEDGE_ARTICLES.length} knowledge articles`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
