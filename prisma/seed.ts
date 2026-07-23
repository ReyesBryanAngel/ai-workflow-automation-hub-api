import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_EMAIL_ANALYSIS_SYSTEM_PROMPT } from '../src/prompts/emailAnalysis.prompt.js';
import { DEFAULT_EMAIL_REPLY_SYSTEM_PROMPT } from '../src/prompts/emailReply.prompt.js';
import { PromptTemplateKey } from '../src/services/promptTemplate.service.js';

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

  console.log('Seeded prompt templates: email_analysis_system, email_reply_system');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
