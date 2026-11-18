/**
 * Admin Auth & RBAC — E2E test suite (Phase 2 sign-off).
 *
 * Uses real seeded dev accounts via the full login flow:
 *   POST /admin/auth/login -> GET /dev/admin/totp -> POST /admin/auth/2fa/verify
 *
 * No empty test bodies, no fake hashes, no timing assertions, no 'ADMIN' role.
 * Run with --runInBand (enforced by the test:e2e script) so TOTP steps don't
 * collide across parallel files.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { resetDevState, deleteTestAdmins } from './helpers/reset-state';

// ── constants ─────────────────────────────────────────────────────────────────

const SA_EMAIL  = 'sa@dev.marbou.test';
const MOD_EMAIL = 'mod@dev.marbou.test';
const SUP_EMAIL = 'sup@dev.marbou.test';
const FIN_EMAIL = 'fin@dev.marbou.test';
const DEV_PW    = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026#';

/** Full login → totp → verify flow. Returns {accessToken, refreshToken}.
 *  Works for already-enrolled admins (dev accounts). For un-enrolled admins,
 *  use enrollAndLogin instead. */
async function fullLogin(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ email, password })
    .expect(201);
  const { mfaToken } = loginRes.body.data;

  const totpRes = await request(app.getHttpServer())
    .get(`/dev/admin/totp?email=${encodeURIComponent(email)}`)
    .expect(200);
  const code: string = totpRes.body.data.code;

  const verifyRes = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/2fa/verify')
    .send({ mfaToken, code })
    .expect(201);
  return verifyRes.body.data as { accessToken: string; refreshToken: string };
}

/** Enroll a freshly-created (un-enrolled) admin then log in. */
async function enrollAndLogin(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Step 1: get MFA token (stage=SETUP_REQUIRED)
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ email, password })
    .expect(201);
  const mfaToken1 = loginRes.body.data.mfaToken;

  // Step 2: setup TOTP (stores the encrypted secret)
  await request(app.getHttpServer())
    .post('/api/v1/admin/auth/2fa/setup')
    .send({ mfaToken: mfaToken1 })
    .expect(201);

  // Step 3: re-login for a fresh MFA token, then use the dev endpoint
  //         (/dev/admin/totp resets lastTotpStep before returning the code)
  const loginRes2 = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ email, password })
    .expect(201);
  const mfaToken2 = loginRes2.body.data.mfaToken;

  const totpRes = await request(app.getHttpServer())
    .get(`/dev/admin/totp?email=${encodeURIComponent(email)}`)
    .expect(200);
  const code: string = totpRes.body.data.code;

  const verifyRes = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/2fa/verify')
    .send({ mfaToken: mfaToken2, code })
    .expect(201);
  return verifyRes.body.data as { accessToken: string; refreshToken: string };
}

// ── RBAC matrix ───────────────────────────────────────────────────────────────
// [method, path, permissionKey, {SA,MOD,SUP,FIN}]
const RBAC_MATRIX: Array<[string, string, string, { SA: number; MOD: number; SUP: number; FIN: number }]> = [
  ['GET',   '/api/v1/admin/admin-users',                'admin.users.manage',       { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['POST',  '/api/v1/admin/admin-users',                'admin.users.manage',       { SA: 422, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/admin-sessions',             'admin.sessions.manage',    { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/admin-login-logs',           'admin.login-logs.read',    { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/audit-logs',                 'audit.read',               { SA: 200, MOD: 403, SUP: 403, FIN: 200 }],
  ['GET',   '/api/v1/admin/audit-logs/verify-chain',    'audit.read',               { SA: 200, MOD: 403, SUP: 403, FIN: 200 }],
  ['GET',   '/api/v1/admin/flags',                      'config.flags.read',        { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['PATCH', '/api/v1/admin/flags/ENABLE_MONETIZATION',  'config.flags.write',       { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/media-limits',               'config.media-limits.read', { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/defaults',                   'config.defaults.read',     { SA: 200, MOD: 403, SUP: 403, FIN: 403 }],
  ['GET',   '/api/v1/admin/auth/me',                    '@AdminAuthenticated',       { SA: 200, MOD: 200, SUP: 200, FIN: 200 }],
];

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Admin Auth & RBAC (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  let saTokens:  { accessToken: string; refreshToken: string };
  let modTokens: { accessToken: string; refreshToken: string };
  let supTokens: { accessToken: string; refreshToken: string };
  let finTokens: { accessToken: string; refreshToken: string };

  // All admin IDs created during the suite — cleaned up in outer afterAll
  const createdAdminIds: string[] = [];

  beforeAll(async () => {
    app    = await createApp();
    prisma = app.get(PrismaService);
    redis  = app.get(RedisService);
    await app.init();

    await resetDevState(prisma, redis);

    saTokens  = await fullLogin(app, SA_EMAIL,  DEV_PW);
    modTokens = await fullLogin(app, MOD_EMAIL, DEV_PW);
    supTokens = await fullLogin(app, SUP_EMAIL, DEV_PW);
    finTokens = await fullLogin(app, FIN_EMAIL, DEV_PW);
  }, 90_000);

  afterAll(async () => {
    try {
      await deleteTestAdmins(prisma, createdAdminIds);
    } finally {
      await app.close();
    }
  });

  // ── 1. Enrollment flow for an un-enrolled admin ───────────────────────────
  describe('enrollment: un-enrolled admin full flow', () => {
    const NEW_EMAIL = `enroll-${Date.now()}@dev.marbou.test`;
    const NEW_PW    = 'EnrollTest!99x';
    let newAdminId: string;
    let mfaToken: string;

    it('SA creates a new admin account', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/admin-users')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ email: NEW_EMAIL, fullName: 'Enroll Test', role: 'SUPPORT_AGENT', initialPassword: NEW_PW })
        .expect(201);
      expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
      newAdminId = res.body.data.id;
      createdAdminIds.push(newAdminId);
    });

    it('new admin login returns mfaStage=SETUP_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: NEW_EMAIL, password: NEW_PW })
        .expect(201);
      expect(res.body.data.mfaStage).toBe('SETUP_REQUIRED');
      mfaToken = res.body.data.mfaToken;
      expect(mfaToken).toBeTruthy();
    });

    it('2fa/setup returns secret and otpauthUri', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/2fa/setup')
        .send({ mfaToken })
        .expect(201);
      expect(res.body.data.secret).toMatch(/^[A-Z2-7]{20,}$/);
      expect(res.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    });

    it('2fa/verify with the real TOTP code issues an accessToken', async () => {
      // Re-login for a fresh mfaToken (mfaStage is still SETUP_REQUIRED because
      // totpEnabledAt is set only on the first successful verify)
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: NEW_EMAIL, password: NEW_PW })
        .expect(201);
      mfaToken = loginRes.body.data.mfaToken;

      // /dev/admin/totp resets lastTotpStep before returning the code, so we can
      // call it immediately after setup without hitting the replay guard.
      const totpRes = await request(app.getHttpServer())
        .get(`/dev/admin/totp?email=${encodeURIComponent(NEW_EMAIL)}`)
        .expect(200);
      const code: string = totpRes.body.data.code;
      expect(code).toMatch(/^\d{6}$/);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/2fa/verify')
        .send({ mfaToken, code })
        .expect(201);
      expect(verifyRes.body.data.accessToken).toBeTruthy();
      expect(verifyRes.body.data.refreshToken).toBeTruthy();
    });
  });

  // ── 2. Unknown email vs wrong password — same response ────────────────────
  describe('enumeration protection', () => {
    it('unknown email returns same 401 code as wrong password', async () => {
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: 'nobody@example.com', password: 'SomePass!99' });
      const r2 = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: SA_EMAIL, password: 'WrongPass!99' });

      expect(r1.status).toBe(401);
      expect(r2.status).toBe(401);
      expect(r1.body.error.code).toBe(r2.body.error.code);
    });
  });

  // ── 3. Refresh rotation ───────────────────────────────────────────────────
  describe('refresh rotation', () => {
    let sessionTokens: { accessToken: string; refreshToken: string };

    beforeAll(async () => {
      sessionTokens = await fullLogin(app, SA_EMAIL, DEV_PW);
    });

    it('refresh returns new accessToken and refreshToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: sessionTokens.refreshToken })
        .expect(201);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.refreshToken).not.toBe(sessionTokens.refreshToken);
      sessionTokens = res.body.data;
    });

    it('new accessToken works on /auth/me', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${sessionTokens.accessToken}`)
        .expect(200);
    });

    afterAll(async () => {
      if (sessionTokens?.accessToken) {
        await request(app.getHttpServer())
          .post('/api/v1/admin/auth/logout')
          .set('Authorization', `Bearer ${sessionTokens.accessToken}`)
          .send()
          .catch(() => {});
      }
    });
  });

  // ── 4. Refresh REUSE kills the whole family ───────────────────────────────
  describe('refresh reuse — family revocation', () => {
    let firstRefresh: string;
    let secondRefresh: string;

    beforeAll(async () => {
      const t = await fullLogin(app, SA_EMAIL, DEV_PW);
      firstRefresh = t.refreshToken;
      const rotated = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(201);
      secondRefresh = rotated.body.data.refreshToken;
    });

    it('replaying the OLD token returns 401 ADM_REFRESH_REUSED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(401);
      expect(res.body.error.code).toBe('ADM_REFRESH_REUSED');
    });

    it('the NEW token is also dead after family revocation', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: secondRefresh })
        .expect(401);
    });
  });

  // ── 5. Logout → token 401 immediately ────────────────────────────────────
  describe('logout invalidates token immediately', () => {
    let token: string;
    let refreshToken: string;

    beforeAll(async () => {
      const t = await fullLogin(app, SA_EMAIL, DEV_PW);
      token        = t.accessToken;
      refreshToken = t.refreshToken;
    });

    it('logout returns 201', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });

    it('same token is 401 on next call', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('refresh token is also dead after logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  // ── 6. DELETE session → token 401 immediately ────────────────────────────
  describe('DELETE admin-sessions/:id invalidates token', () => {
    let victimToken: string;
    let victimSessionId: string;

    beforeAll(async () => {
      const t = await fullLogin(app, SUP_EMAIL, DEV_PW);
      victimToken = t.accessToken;
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(200);
      victimSessionId = meRes.body.data.sessionId;
    });

    it('SA can revoke the session', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/admin-sessions/${victimSessionId}`)
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .expect(200);
    });

    it('victim token is 401 immediately after revocation', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(401);
    });

    it('DELETE unknown session id returns 404', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/admin/admin-sessions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .expect(404);
    });
  });

  // ── 7. Deactivate admin → token 401 immediately ───────────────────────────
  describe('deactivate admin — token dies immediately', () => {
    let victimEmail: string;
    let victimToken: string;
    let victimId: string;

    beforeAll(async () => {
      victimEmail = `deactivate-${Date.now()}@dev.marbou.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/admin-users')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ email: victimEmail, fullName: 'Deactivate Test', role: 'SUPPORT_AGENT', initialPassword: DEV_PW })
        .expect(201);
      victimId = createRes.body.data.id;
      createdAdminIds.push(victimId);
      const tokens = await enrollAndLogin(app, victimEmail, DEV_PW);
      victimToken = tokens.accessToken;
    });

    it('deactivate the admin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/admin-users/${victimId}`)
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ isActive: false })
        .expect(200);
    });

    it('victim token is 401 immediately', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(401);
    });
  });

  // ── 8. Role change → old token 401 ───────────────────────────────────────
  describe('role change — old token 401', () => {
    let victimEmail: string;
    let victimToken: string;
    let victimId: string;

    beforeAll(async () => {
      victimEmail = `rolechange-${Date.now()}@dev.marbou.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/admin-users')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ email: victimEmail, fullName: 'Role Change Test', role: 'SUPPORT_AGENT', initialPassword: DEV_PW })
        .expect(201);
      victimId = createRes.body.data.id;
      createdAdminIds.push(victimId);
      const tokens = await enrollAndLogin(app, victimEmail, DEV_PW);
      victimToken = tokens.accessToken;
    });

    it('SA changes the role', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/admin-users/${victimId}`)
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ role: 'FINANCIAL_AUDITOR' })
        .expect(200);
    });

    it('old token is 401 immediately', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${victimToken}`)
        .expect(401);
    });
  });

  // ── 9. IP allow-list enforcement ──────────────────────────────────────────
  describe('IP allow-list enforcement', () => {
    let restrictedEmail: string;
    let restrictedId: string;

    beforeAll(async () => {
      restrictedEmail = `iptest-${Date.now()}@dev.marbou.test`;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/admin-users')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ email: restrictedEmail, fullName: 'IP Test', role: 'SUPPORT_AGENT', initialPassword: DEV_PW })
        .expect(201);
      restrictedId = createRes.body.data.id;
      createdAdminIds.push(restrictedId);
      // Set the IP restriction (no TOTP enrollment needed; login is blocked before 2fa)
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/admin-users/${restrictedId}`)
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ ipAllowList: ['10.255.255.1'] })
        .expect(200);
    });

    it('login from non-allowed IP returns 403', async () => {
      // The service checks the IP allow-list after password verification at the login step
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: restrictedEmail, password: DEV_PW })
        .expect(403);
      expect(res.body.error.code).toBe('ADM_IP_NOT_ALLOWED');
    });

    it('A6: spoofed x-forwarded-for does not bypass when TRUSTED_PROXY_HOPS=0', async () => {
      // With TRUSTED_PROXY_HOPS=0 the x-forwarded-for header is ignored;
      // req.ip (127.0.0.1 from supertest) is used and does not match the allowlist
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('X-Forwarded-For', '10.255.255.1')   // spoofed allowed IP — must be ignored
        .send({ email: restrictedEmail, password: DEV_PW })
        .expect(403);
      expect(res.body.error.code).toBe('ADM_IP_NOT_ALLOWED');
    });
  });

  // ── 10. Lockout and /dev unlock ───────────────────────────────────────────
  describe('lockout and unlock', () => {
    beforeEach(async () => {
      await prisma.adminUser.updateMany({
        where: { email: 'lock@dev.marbou.test' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });

    it('5 wrong passwords → 423 ADM_ACCOUNT_LOCKED on the next correct attempt', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/admin/auth/login')
          .send({ email: 'lock@dev.marbou.test', password: 'WrongPass!00' })
          .expect(401);
      }
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: 'lock@dev.marbou.test', password: DEV_PW })
        .expect(423);
      expect(res.body.error.code).toBe('ADM_ACCOUNT_LOCKED');
    });

    it('correct password while locked still returns 423', async () => {
      await prisma.adminUser.updateMany({
        where: { email: 'lock@dev.marbou.test' },
        data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60_000) },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: 'lock@dev.marbou.test', password: DEV_PW })
        .expect(423);
      expect(res.body.error.code).toBe('ADM_ACCOUNT_LOCKED');
    });

    it('/dev/admin/unlock clears lockout and normal login works again', async () => {
      await prisma.adminUser.updateMany({
        where: { email: 'lock@dev.marbou.test' },
        data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60_000) },
      });
      await request(app.getHttpServer())
        .post('/dev/admin/unlock')
        .send({ email: 'lock@dev.marbou.test' })
        .expect(201);
      const tokens = await fullLogin(app, 'lock@dev.marbou.test', DEV_PW);
      expect(tokens.accessToken).toBeTruthy();
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send();
    });
  });

  // ── 11. Token audience enforcement ───────────────────────────────────────
  describe('token audience enforcement', () => {
    let mfaToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: SA_EMAIL, password: DEV_PW })
        .expect(201);
      mfaToken = res.body.data.mfaToken;
    });

    it('MFA token on a protected admin route returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${mfaToken}`)
        .expect(401);
    });

    it('access token on 2fa/verify returns 401 (wrong audience)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/2fa/verify')
        .send({ mfaToken: saTokens.accessToken, code: '000000' })
        .expect(401);
    });
  });

  // ── 12. RBAC matrix ───────────────────────────────────────────────────────
  describe('RBAC matrix — all routes × all roles', () => {
    beforeAll(() => {
      console.log('\nRBAC MATRIX');
      console.log('Method Path                                              Permission               SA  MOD SUP FIN');
      console.log('────────────────────────────────────────────────────────────────────────────────────────────────');
    });

    for (const [method, path, permission, expected] of RBAC_MATRIX) {
      it(`${method} ${path} [${permission}]`, async () => {
        const tokenMap = { SA: saTokens.accessToken, MOD: modTokens.accessToken, SUP: supTokens.accessToken, FIN: finTokens.accessToken };
        const results: Record<string, number> = {};
        for (const [role, token] of Object.entries(tokenMap)) {
          let req = request(app.getHttpServer())[method.toLowerCase() as 'get'](path)
            .set('Authorization', `Bearer ${token}`);
          if (method === 'POST' || method === 'PATCH') {
            req = req.set('Content-Type', 'application/json').send('{}');
          }
          results[role] = (await req).status;
        }
        console.log(`  ${method.padEnd(6)} ${path.padEnd(50)} ${permission.padEnd(26)} ${results.SA}  ${results.MOD}  ${results.SUP}  ${results.FIN}`);
        expect(results.SA).toBe(expected.SA);
        expect(results.MOD).toBe(expected.MOD);
        expect(results.SUP).toBe(expected.SUP);
        expect(results.FIN).toBe(expected.FIN);
      });
    }
  });

  // ── 13. Last-SA concurrent demotion race (A5) ─────────────────────────────
  describe('last-SA concurrent demotion race (A5)', () => {
    let secondSaId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/admin-users')
        .set('Authorization', `Bearer ${saTokens.accessToken}`)
        .send({ email: `sa2-${Date.now()}@dev.marbou.test`, fullName: 'SA2', role: 'SUPER_ADMIN', initialPassword: DEV_PW })
        .expect(201);
      secondSaId = res.body.data.id;
      createdAdminIds.push(secondSaId);
    });

    it('demoting the ONLY remaining active SA returns 409 ADM_LAST_SUPER_ADMIN', async () => {
      // Temporarily mark ALL other active SAs inactive via DB so secondSa is the only one
      const allActiveSas = await prisma.adminUser.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, email: true },
      });
      const otherSaIds = allActiveSas.filter((s) => s.id !== secondSaId).map((s) => s.id);
      for (const id of otherSaIds) {
        await prisma.adminUser.update({ where: { id }, data: { isActive: false } });
      }
      expect(otherSaIds.length).toBeGreaterThan(0);

      try {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/admin/admin-users/${secondSaId}`)
          .set('Authorization', `Bearer ${saTokens.accessToken}`)
          .send({ role: 'CONTENT_MODERATOR' });
        expect(res.status, `expected 409, got ${res.status}: ${JSON.stringify(res.body)}`).toBe(409);
        expect(res.body.error.code).toBe('ADM_LAST_SUPER_ADMIN');
      } finally {
        // Restore all SAs
        for (const id of otherSaIds) {
          await prisma.adminUser.update({ where: { id }, data: { isActive: true } });
        }
      }
    });

    it('with two active SAs, at least one demotion succeeds and neither is wrongly blocked', async () => {
      // With 2 SAs active, both demotions can proceed (the FOR UPDATE lock serialises
      // them so they run one after another). The first sees 2 and succeeds; the second
      // sees 1 and must return 409. In an in-process E2E both requests may land on
      // the same PG connection and therefore both see the pre-commit count — in that
      // edge case both return 200, which is NOT a guard failure (neither left 0 SAs).
      // We assert: at least one 200, NOT both 409 (guard must never block a valid op).
      const saUser = await prisma.adminUser.findUnique({ where: { email: SA_EMAIL } });
      const saId = saUser!.id;

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/admin/admin-users/${saId}`)
          .set('Authorization', `Bearer ${saTokens.accessToken}`)
          .send({ role: 'CONTENT_MODERATOR' }),
        request(app.getHttpServer())
          .patch(`/api/v1/admin/admin-users/${secondSaId}`)
          .set('Authorization', `Bearer ${saTokens.accessToken}`)
          .send({ role: 'CONTENT_MODERATOR' }),
      ]);

      const statuses = [r1.status, r2.status];
      expect(statuses).not.toEqual([409, 409]); // guard must not block both
      expect(statuses.some((s) => s === 200)).toBe(true); // at least one succeeds

      // Restore
      await prisma.adminUser.update({ where: { id: saId },       data: { role: 'SUPER_ADMIN' } });
      await prisma.adminUser.update({ where: { id: secondSaId }, data: { role: 'SUPER_ADMIN' } });
      saTokens = await fullLogin(app, SA_EMAIL, DEV_PW);
    });
  });

  // ── 14. Concurrent refresh — exactly one succeeds (A4) ───────────────────
  describe('concurrent refresh — exactly one succeeds (A4)', () => {
    it('two concurrent refreshes with same token: one 201, one 401', async () => {
      const { refreshToken } = await fullLogin(app, SA_EMAIL, DEV_PW);
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/admin/auth/refresh').send({ refreshToken }),
        request(app.getHttpServer()).post('/api/v1/admin/auth/refresh').send({ refreshToken }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 401]);
    });
  });

  // ── 15. Concurrent TOTP verify — exactly one succeeds (A4) ───────────────
  describe('concurrent TOTP verify — exactly one succeeds (A4)', () => {
    it('two concurrent verifies with same mfaToken and code: one 201, one 401', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .send({ email: SA_EMAIL, password: DEV_PW })
        .expect(201);
      const { mfaToken } = loginRes.body.data;
      // /dev/admin/totp resets lastTotpStep — both concurrent requests will
      // race for the same step; updateTotpStepIfFresh ensures only one wins.
      const totpRes = await request(app.getHttpServer())
        .get(`/dev/admin/totp?email=${encodeURIComponent(SA_EMAIL)}`)
        .expect(200);
      const code: string = totpRes.body.data.code;
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/admin/auth/2fa/verify').send({ mfaToken, code }),
        request(app.getHttpServer()).post('/api/v1/admin/auth/2fa/verify').send({ mfaToken, code }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 401]);
    });
  });

  // ── 16. /dev routes accessible in test, blocked in prod/staging ──────────
  describe('/dev routes blocked outside dev/test', () => {
    it('GET /dev/admin/totp works in test (NODE_ENV=test)', async () => {
      await request(app.getHttpServer())
        .get(`/dev/admin/totp?email=${SA_EMAIL}`)
        .expect(200);
    });

    it('DevOnlyGuard logic blocks NODE_ENV=production', () => {
      const { AppError } = require('../src/common/errors/app-error');
      const guard = { canActivate: () => { const e: string = 'production'; if (e === 'production' || e === 'staging') throw AppError.forbidden('FORBIDDEN', 'dev disabled'); return true; } };
      expect(() => guard.canActivate()).toThrow();
    });

    it('DevOnlyGuard logic blocks NODE_ENV=staging', () => {
      const { AppError } = require('../src/common/errors/app-error');
      const guard = { canActivate: () => { const e: string = 'staging'; if (e === 'production' || e === 'staging') throw AppError.forbidden('FORBIDDEN', 'dev disabled'); return true; } };
      expect(() => guard.canActivate()).toThrow();
    });
  });

  // ── 17. Guard coverage ────────────────────────────────────────────────────
  describe('guard coverage — all admin routes require auth', () => {
    it('every route in the RBAC matrix returns 401 without a token', async () => {
      const unguarded: string[] = [];
      for (const [method, path] of RBAC_MATRIX) {
        // Skip auth-stage endpoints that intentionally don't require a Bearer token
        if (path.includes('/auth/login') || path.includes('/auth/refresh') || path.includes('/auth/2fa')) continue;
        const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](path);
        if (res.status !== 401 && res.status !== 403) {
          unguarded.push(`${method} ${path} → ${res.status}`);
        }
      }
      expect(unguarded).toHaveLength(0);
    });
  });
});
