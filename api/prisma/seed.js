require('dotenv').config();

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function upsertAccount({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role },
  });
}

async function main() {
  const admin = await upsertAccount({
    name: process.env.SEED_ADMIN_NAME || 'Auto-ATC Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@auto-atc.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe-Admin-123!',
    role: 'admin',
  });
  const typer = await upsertAccount({
    name: process.env.SEED_TYPER_NAME || 'Field Typer',
    email: process.env.SEED_TYPER_EMAIL || 'typer@auto-atc.local',
    password: process.env.SEED_TYPER_PASSWORD || 'ChangeMe-Typer-123!',
    role: 'typer',
  });

  console.log(`Seeded admin ${admin.email} and field typer ${typer.email}`);
}

main()
  .catch((error) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
