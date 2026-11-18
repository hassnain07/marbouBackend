'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEV_EMAILS = [
  'sa@dev.marbou.test',
  'mod@dev.marbou.test',
  'sup@dev.marbou.test',
  'fin@dev.marbou.test',
  'lock@dev.marbou.test',
];

const ROLES = {
  'sa@dev.marbou.test': 'SUPER_ADMIN',
  'mod@dev.marbou.test': 'CONTENT_MODERATOR',
  'sup@dev.marbou.test': 'SUPPORT_AGENT',
  'fin@dev.marbou.test': 'FINANCIAL_AUDITOR',
  'lock@dev.marbou.test': 'SUPPORT_AGENT',
};

(async () => {
  // Reset counters + lockout + TOTP step
  await prisma.adminUser.updateMany({
    where: { email: { in: DEV_EMAILS } },
    data: { failedLoginCount: 0, lockedUntil: null, isActive: true, lastTotpStep: null },
  });
  // Restore roles
  for (const email of DEV_EMAILS) {
    await prisma.adminUser.updateMany({
      where: { email },
      data: { role: ROLES[email] },
    });
  }
  // Revoke all active sessions for dev accounts
  await prisma.adminSession.updateMany({
    where: { admin: { email: { in: DEV_EMAILS } }, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'reset' },
  });
  // Delete any test-created admins (emails matching *@dev.marbou.test but not the 5 seeded ones)
  await prisma.adminUser.deleteMany({
    where: { email: { contains: '@dev.marbou.test', notIn: DEV_EMAILS } },
  });
  console.log('DB state restored');
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
