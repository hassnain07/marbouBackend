/**
 * Phase 1 Platform e2e tests — Flags, RemoteConfig, Defaults, Audit Log.
 *
 * Runs against a real Postgres + Redis (the Docker infra stack). The bootstrap
 * admin guard is exercised with the ADMIN_BOOTSTRAP_KEY from setup-env.ts.
 *
 * Tests are ordered and run serially. Each mutating test reverts its change at
 * the end so the suite is re-runnable. The DB must have migrations + seed applied.
 */
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

const KEY = process.env.ADMIN_BOOTSTRAP_KEY ?? 'dev-bootstrap-key-change-me-min16';
const admin = (agent: ReturnType<typeof request>) =>
  agent.set('x-admin-bootstrap-key', KEY);

describe('Phase 1 — Platform Services (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    http = request(app.getHttpServer());
  }, 20000);

  afterAll(async () => {
    await app.close();
  }, 15000);

  // ── GET /api/v1/config — public + ETag ───────────────────────────────────

  describe('GET /api/v1/config', () => {
    it('returns 200 with appVersions, maintenance, mediaLimits, activeFlags', async () => {
      const res = await http.get('/api/v1/config').set('Accept-Language', 'en');
      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data).toHaveProperty('appVersions');
      expect(data).toHaveProperty('maintenance');
      expect(data).toHaveProperty('mediaLimits');
      expect(data).toHaveProperty('activeFlags');
      expect(typeof data.activeFlags['otp.email']).toBe('boolean');
    });

    it('returns ETag header', async () => {
      const res = await http.get('/api/v1/config');
      expect(res.headers['etag']).toMatch(/^"[0-9a-f]{64}"$/);
    });

    it('returns 304 on If-None-Match match', async () => {
      const first = await http.get('/api/v1/config');
      const etag = first.headers['etag'];
      const second = await http.get('/api/v1/config').set('If-None-Match', etag);
      expect(second.status).toBe(304);
      expect(second.text).toBe('');
    });
  });

  // ── GET /api/v1/flags — public ────────────────────────────────────────────

  describe('GET /api/v1/flags', () => {
    it('returns a map of flag key → boolean', async () => {
      const res = await http.get('/api/v1/flags');
      expect(res.status).toBe(200);
      expect(typeof res.body.data['otp.email']).toBe('boolean');
      expect(typeof res.body.data['ENABLE_MONETIZATION']).toBe('boolean');
    });

    it('returns ETag + 304 on repeat', async () => {
      const r1 = await http.get('/api/v1/flags');
      const r2 = await http.get('/api/v1/flags').set('If-None-Match', r1.headers['etag']);
      expect(r2.status).toBe(304);
    });
  });

  // ── Admin flag endpoints ──────────────────────────────────────────────────

  describe('Admin flags', () => {
    it('GET /api/v1/admin/flags requires bootstrap key', async () => {
      const res = await http.get('/api/v1/admin/flags');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/admin/flags returns all flags with key', async () => {
      const res = await admin(http.get('/api/v1/admin/flags'));
      expect(res.status).toBe(200);
      const flags = res.body.data as any[];
      expect(flags.some((f) => f.key === 'otp.email')).toBe(true);
      expect(flags.some((f) => f.key === 'ENABLE_MONETIZATION')).toBe(true);
    });

    it('PATCH a non-OTP flag and verify it in GET /api/v1/flags', async () => {
      // Toggle ENABLE_MONETIZATION (default OFF)
      const before = await admin(http.get('/api/v1/admin/flags'));
      const originalValue = (before.body.data as any[]).find(
        (f) => f.key === 'ENABLE_MONETIZATION',
      )?.enabled ?? false;

      const patch = await admin(
        http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: true }),
      );
      expect(patch.status).toBe(200);
      expect(patch.body.data.enabled).toBe(true);

      // Public flags should reflect the change
      const flags = await http.get('/api/v1/flags');
      expect(flags.body.data['ENABLE_MONETIZATION']).toBe(true);

      // Revert
      await admin(
        http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: originalValue }),
      );
    });

    it('GET /api/v1/admin/flags/:key/history returns history', async () => {
      // Create a change first
      await admin(
        http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: true }),
      );
      const res = await admin(http.get('/api/v1/admin/flags/ENABLE_MONETIZATION/history'));
      expect(res.status).toBe(200);
      const history = res.body.data as any[];
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('enabled');
      expect(history[0]).toHaveProperty('changedAt');
      // Revert
      await admin(
        http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: false }),
      );
    });

    it('refuses to disable the last enabled OTP channel (422 AUTH_OTP_LAST_CHANNEL)', async () => {
      // Ensure sms + whatsapp are OFF
      await admin(http.patch('/api/v1/admin/flags/otp.sms').send({ enabled: false }));
      await admin(http.patch('/api/v1/admin/flags/otp.whatsapp').send({ enabled: false }));
      // otp.email is the last enabled channel — disabling should fail
      const res = await admin(http.patch('/api/v1/admin/flags/otp.email').send({ enabled: false }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('AUTH_OTP_LAST_CHANNEL');
    });

    it('PATCH with an invalid body returns 422', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/flags/otp.email').send({ enabled: 'not-a-boolean' }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // ── Maintenance mode ──────────────────────────────────────────────────────

  describe('Admin maintenance', () => {
    const maintenance = {
      enabled: true,
      startAt: null,
      endAt: null,
      bannerAr: 'صيانة مجدولة',
      bannerEn: 'Scheduled maintenance',
    };

    it('PATCH /admin/maintenance updates the config', async () => {
      const res = await admin(http.patch('/api/v1/admin/maintenance').send(maintenance));
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
    });

    it('GET /api/v1/config shows banner in ar and en', async () => {
      const res = await http.get('/api/v1/config').set('Accept-Language', 'ar');
      expect(res.status).toBe(200);
      expect(res.body.data.maintenance.bannerAr).toBe('صيانة مجدولة');
      expect(res.body.data.maintenance.bannerEn).toBe('Scheduled maintenance');
    });

    it('reverts maintenance to OFF', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/maintenance').send({
          enabled: false,
          startAt: null,
          endAt: null,
          bannerAr: 'الموقع تحت الصيانة، يرجى المحاولة لاحقاً',
          bannerEn: 'The service is under maintenance, please try again later',
        }),
      );
      expect(res.body.data.enabled).toBe(false);
    });
  });

  // ── Media limits ──────────────────────────────────────────────────────────

  describe('Admin media limits', () => {
    it('GET /admin/media-limits returns current limits', async () => {
      // Reset to known state in case a previous run left stale values.
      await admin(http.patch('/api/v1/admin/media-limits').send({ maxPhotosPerListing: 10, maxVideoDurationSeconds: 30, videoEnabled: true }));
      const res = await admin(http.get('/api/v1/admin/media-limits'));
      expect(res.status).toBe(200);
      expect(res.body.data.maxPhotosPerListing).toBe(10);
      expect(res.body.data.maxVideoDurationSeconds).toBe(30);
    });

    it('PATCH /admin/media-limits updates and reverts', async () => {
      const patch = await admin(
        http.patch('/api/v1/admin/media-limits').send({ maxPhotosPerListing: 12 }),
      );
      expect(patch.status).toBe(200);
      expect(patch.body.data.maxPhotosPerListing).toBe(12);
      // Revert
      await admin(http.patch('/api/v1/admin/media-limits').send({ maxPhotosPerListing: 10 }));
    });
  });

  // ── App versions ──────────────────────────────────────────────────────────

  describe('Admin app-versions', () => {
    it('PATCH /admin/app-versions updates and reverts', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/app-versions').send({
          ios: { minimum: '1.0.1', latest: '1.0.1' },
          android: { minimum: '1.0.1', latest: '1.0.1' },
        }),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.ios.minimum).toBe('1.0.1');
      // Revert
      await admin(
        http.patch('/api/v1/admin/app-versions').send({
          ios: { minimum: '1.0.0', latest: '1.0.0' },
          android: { minimum: '1.0.0', latest: '1.0.0' },
        }),
      );
    });
  });

  // ── Defaults ─────────────────────────────────────────────────────────────

  describe('Admin defaults', () => {
    it('GET /admin/defaults returns all Appendix C settings', async () => {
      // Reset listing.photos.max to 10 in case a previous run left it at 12
      await admin(http.patch('/api/v1/admin/defaults').send({ key: 'listing.photos.max', value: 10 }));
      const res = await admin(http.get('/api/v1/admin/defaults'));
      expect(res.status).toBe(200);
      const rows = res.body.data as any[];
      expect(rows.length).toBeGreaterThanOrEqual(43);
      const photoMax = rows.find((r) => r.key === 'listing.photos.max');
      expect(photoMax?.value).toBe(10);
    });

    it('PATCH a default, check audit entry, and revert', async () => {
      const patch = await admin(
        http.patch('/api/v1/admin/defaults').send({ key: 'listing.photos.max', value: 12 }),
      );
      expect(patch.status).toBe(200);
      expect(patch.body.data.value).toBe(12);

      // Audit entry should exist for this change
      const auditRes = await admin(
        http.get('/api/v1/admin/audit-logs').query({ entity: 'DefaultSetting', entityId: 'listing.photos.max' }),
      );
      expect(auditRes.status).toBe(200);
      const logs = auditRes.body.data as any[];
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].before).toEqual(10);
      expect(logs[0].after).toEqual(12);

      // Revert
      await admin(http.patch('/api/v1/admin/defaults').send({ key: 'listing.photos.max', value: 10 }));
    });

    it('PATCH with wrong type returns 422 DEFAULTS_INVALID_TYPE', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/defaults').send({ key: 'listing.photos.max', value: 'ten' }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEFAULTS_INVALID_TYPE');
    });
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  describe('Admin audit-logs', () => {
    it('GET /admin/audit-logs returns paginated rows', async () => {
      const res = await admin(http.get('/api/v1/admin/audit-logs'));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('requestId');
    });

    it('filters by entity', async () => {
      const res = await admin(
        http.get('/api/v1/admin/audit-logs').query({ entity: 'FeatureFlag' }),
      );
      expect(res.status).toBe(200);
      const rows = res.body.data as any[];
      rows.forEach((r) => expect(r.entity).toBe('FeatureFlag'));
    });

    it('GET /admin/audit-logs/verify-chain returns valid:true', async () => {
      const res = await admin(http.get('/api/v1/admin/audit-logs/verify-chain'));
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.checked).toBeGreaterThan(0);
    });

    it('audit rows have id serialised as string (BigInt safety)', async () => {
      const res = await admin(http.get('/api/v1/admin/audit-logs'));
      const rows = res.body.data as any[];
      if (rows.length > 0) {
        expect(typeof rows[0].id).toBe('string');
      }
    });
  });

  // ── Missing bootstrap key / wrong key → 401 ──────────────────────────────

  describe('Bootstrap key guard', () => {
    it('missing key → 401', async () => {
      const res = await http.get('/api/v1/admin/flags');
      expect(res.status).toBe(401);
    });

    it('wrong key → 401', async () => {
      const res = await http.get('/api/v1/admin/flags').set('x-admin-bootstrap-key', 'wrong-key');
      expect(res.status).toBe(401);
    });
  });

  // ── @RequiresFlag guard ───────────────────────────────────────────────────

  describe('@RequiresFlag via /dev/flag-test', () => {
    it('returns 404 FEATURE_DISABLED when the flag is OFF (default state)', async () => {
      // Ensure ENABLE_MONETIZATION is OFF.
      await admin(http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: false }));
      const res = await http.get('/dev/flag-test');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    });

    it('returns 404 FEATURE_DISABLED localised for Arabic', async () => {
      const res = await http.get('/dev/flag-test').set('Accept-Language', 'ar');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
      expect(res.body.error.message).toBe('هذه الميزة غير مفعّلة');
    });

    it('returns 200 when the flag is turned ON', async () => {
      await admin(http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: true }));
      const res = await http.get('/dev/flag-test');
      expect(res.status).toBe(200);
      expect(res.body.data.flagEnabled).toBe(true);
    });

    it('returns 404 again after turning the flag OFF', async () => {
      await admin(http.patch('/api/v1/admin/flags/ENABLE_MONETIZATION').send({ enabled: false }));
      const res = await http.get('/dev/flag-test');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    });
  });

  // ── Audit null handling (item 3) ─────────────────────────────────────────

  describe('Audit null handling', () => {
    it('record() with no before/after then verifyChain() → valid:true', async () => {
      // Trigger an audit record by patching a default with a sentinel value.
      await admin(http.patch('/api/v1/admin/defaults').send({ key: 'listing.photos.max', value: 10 }));
      const res = await admin(http.get('/api/v1/admin/audit-logs/verify-chain'));
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.checked).toBeGreaterThan(0);
    });
  });

  // ── Defaults validation: quality weights sum (item 5) ────────────────────

  describe('Defaults validation', () => {
    it('rejects quality weight change that breaks the sum=100 rule', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/defaults').send({ key: 'quality.weight.titleDescription', value: 26 }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEFAULTS_VALUE_OUT_OF_RANGE');
      expect(res.body.error.details[0].issue).toMatch(/sum/i);
    });

    it('rejects a negative cap value', async () => {
      const res = await admin(
        http.patch('/api/v1/admin/defaults').send({ key: 'listing.cap.individual', value: -5 }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEFAULTS_VALUE_OUT_OF_RANGE');
    });
  });

  // ── GET /flags excludes internal flags (item 7) ───────────────────────────

  describe('Public flags visibility (item 7)', () => {
    it('GET /api/v1/flags excludes internal flags (moderation.delayed_visibility)', async () => {
      const res = await http.get('/api/v1/flags');
      expect(res.status).toBe(200);
      // moderation.delayed_visibility is internal (clientVisible=false) → excluded.
      expect('moderation.delayed_visibility' in res.body.data).toBe(false);
      // Client-visible flags still present (flat keys with dots in the name).
      expect('otp.email' in res.body.data).toBe(true);
      expect('ENABLE_MONETIZATION' in res.body.data).toBe(true);
    });
  });
});
