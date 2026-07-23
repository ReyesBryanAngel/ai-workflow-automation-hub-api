import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const passwordHash = await hashPassword(env.adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: env.adminEmail },
    update: { passwordHash },
    create: { email: env.adminEmail, passwordHash },
  });

  console.log(`Seeded admin user: ${admin.email}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
