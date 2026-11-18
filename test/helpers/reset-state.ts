/**
 * Shared E2E state-reset helper.
 *
 * Call in beforeAll/beforeEach of every E2E suite that touches admin auth.
 * Flushes Redis rate-limit and session-cache keys, resets all *@dev.marbou.test
 * accounts to their seeded defaults, and revokes any stale sessions.
 *
 * Rules:
 * - Does NOT touch production security behaviour (replay guard, lockout logic,
 *   rate-limit algorithm).
 * - Only purges `rl:` and `admin:session:` Redis key patterns so intentional
 *   rate-limit tests (using /dev/rate-test) remain unaffected between runs.
 * - Does NOT clear TOTP secrets or totpEnabledAt — those are set once at seed
 *   time and must stay for auth to work.
 */

import { type PrismaService } from '../../src/prisma/prisma.service';
import { type RedisService } from '../../src/redis/redis.service';

/** Seeded roles for each dev account (matches prisma/seed/admin.seed.ts). */
const DEV_ACCOUNT_DEFAULTS: Array<{ email: string; role: string; isActive: boolean }> = [
  { email: 'sa@dev.marbou.test',   role: 'SUPER_ADMIN',        isActive: true },
  { email: 'mod@dev.marbou.test',  role: 'CONTENT_MODERATOR',  isActive: true },
  { email: 'sup@dev.marbou.test',  role: 'SUPPORT_AGENT',      isActive: true },
  { email: 'fin@dev.marbou.test',  role: 'FINANCIAL_AUDITOR',  isActive: true },
  { email: 'lock@dev.marbou.test', role: 'SUPPORT_AGENT',      isActive: true },
];

const DEV_EMAILS = DEV_ACCOUNT_DEFAULTS.map((a) => a.email);

export async function resetDevState(prisma: PrismaService, redis: RedisService): Promise<void> {
  // ── 1. Flush Redis rl:* (rate-limit counters) and admin:session:* (guard cache) ──
  const rlKeys    = await redis.client.keys('rl:*');
  const sessKeys  = await redis.client.keys('admin:session:*');
  const allKeys   = [...rlKeys, ...sessKeys];
  if (allKeys.length > 0) {
    await redis.client.del(...allKeys);
  }

  // ── 2. Revoke all active sessions for dev accounts ──────────────────────────
  await prisma.adminSession.updateMany({
    where: { admin: { email: { in: DEV_EMAILS } }, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'e2e reset' },
  });

  // ── 3. Reset account state to seeded defaults ────────────────────────────────
  // Apply per-account role + isActive restoration individually (updateMany
  // doesn't support per-row different values), then bulk-reset counters.
  for (const acc of DEV_ACCOUNT_DEFAULTS) {
    await prisma.adminUser.updateMany({
      where: { email: acc.email },
      data: { role: acc.role as any, isActive: acc.isActive },
    });
  }
  await prisma.adminUser.updateMany({
    where: { email: { in: DEV_EMAILS } },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      // Reset lastTotpStep so the next /dev/admin/totp call within the same
      // 30-second window is not blocked by the replay guard.
      // The dev controller also resets this on every GET /dev/admin/totp call,
      // so this is belt-and-braces for cases where the dev endpoint is not used.
      lastTotpStep: null,
    },
  });
}

/**
 * Delete test-created AdminUser rows (those not in the seeded set).
 * Safe to call in afterAll — ignores errors so test-created rows that were
 * already cleaned up mid-test don't cause a secondary failure.
 */
export async function deleteTestAdmins(prisma: PrismaService, ids: string[]): Promise<void> {
  for (const id of ids) {
    await prisma.adminSession.deleteMany({ where: { adminId: id } }).catch(() => {});
    await prisma.adminUser.delete({ where: { id } }).catch(() => {});
  }
}
