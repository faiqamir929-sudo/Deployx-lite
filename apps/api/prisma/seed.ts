import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const devPassword = await bcrypt.hash('Dev123456!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@deployx.local' },
    update: {},
    create: {
      email: 'admin@deployx.local',
      name: 'Platform Admin',
      role: Role.ADMIN,
      passwordHash: adminPassword,
    },
  });

  const developer = await prisma.user.upsert({
    where: { email: 'dev@deployx.local' },
    update: {},
    create: {
      email: 'dev@deployx.local',
      name: 'Demo Developer',
      role: Role.DEVELOPER,
      passwordHash: devPassword,
    },
  });

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-001' },
    update: {},
    create: {
      id: 'seed-project-001',
      name: 'DeployX Demo App',
      description: 'Sample Next.js application for deployment simulation',
      repoUrl: 'https://github.com/vercel/next.js',
      branch: 'canary',
      framework: 'Next.js',
      environment: 'DEVELOPMENT',
      tags: ['demo', 'nextjs'],
      ownerId: developer.id,
    },
  });

  console.log('Seed complete:', { admin: admin.email, developer: developer.email, project: project.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
