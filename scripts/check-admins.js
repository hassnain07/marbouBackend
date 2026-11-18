'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.adminUser
  .findMany({
    where: { email: { in: ['sa@dev.marbou.test','mod@dev.marbou.test','sup@dev.marbou.test','fin@dev.marbou.test','admin@marbou.test'] } },
    select: { email: true, role: true, isActive: true, failedLoginCount: true, lockedUntil: true, totpEnabledAt: true },
  })
  .then((rows) => { console.log(JSON.stringify(rows, null, 2)); })
  .catch((e) => { console.error(e.message); })
  .finally(() => prisma.$disconnect());
