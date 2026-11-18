'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

(async () => {
  const pw = process.env.ADMIN_SEED_PASSWORD;
  console.log('Seed password from env:', JSON.stringify(pw), '(length:', pw.length, ')');

  // Re-hash all admin accounts with the corrected password
  const admins = await prisma.adminUser.findMany({ select: { id: true, email: true, role: true } });
  const newHash = await argon2.hash(pw, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });

  for (const admin of admins) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newHash },
    });
    console.log('Re-hashed:', admin.email);
  }

  // Verify
  const sa = await prisma.adminUser.findUnique({ where: { email: 'sa@dev.marbou.test' } });
  const ok = await argon2.verify(sa.passwordHash, pw);
  console.log('Verification — sa@dev.marbou.test password matches:', ok);

  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
