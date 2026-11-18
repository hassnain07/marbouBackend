'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.adminUser
  .update({
    where: { email: 'sa@dev.marbou.test' },
    data: { role: 'SUPER_ADMIN', isActive: true, failedLoginCount: 0, lockedUntil: null },
  })
  .then((r) => console.log('Restored:', r.email, r.role))
  .catch((e) => console.error(e.message))
  .finally(() => prisma.$disconnect());
