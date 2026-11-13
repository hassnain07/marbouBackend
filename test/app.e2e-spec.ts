import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

/**
 * Phase 0 foundation smoke test (Postman P00 folder equivalents).
 * Runs with no database or Redis — the app boots in degraded mode and
 * degrades open on rate-limiting.
 */
describe('MARBOU API — Phase 0 foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 15000); // allow up to 15s for BullMQ / ioredis connections to close

  // ── Health ────────────────────────────────────────────────

  it('GET /health → 200 liveness envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.meta.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/ready → 200 or 503 with { db, redis, storage }', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    // 200 when all deps up, 503 when any are down (degraded in CI without DB/Redis)
    expect([200, 503]).toContain(res.status);
    expect(res.body.success).toBe(true); // envelope always present
    expect(res.body.data).toHaveProperty('db');
    expect(res.body.data).toHaveProperty('redis');
    expect(res.body.data).toHaveProperty('storage');
  });

  it('GET /health/ready → response is never hung; completes in < 5 s', async () => {
    const start = Date.now();
    await request(app.getHttpServer()).get('/health/ready');
    expect(Date.now() - start).toBeLessThan(5000);
  });

  // ── Swagger ────────────────────────────────────────────────

  it('GET /api/docs-json → valid OpenAPI JSON (not wrapped in envelope)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.info.title).toBe('MARBOU API');
    expect(res.body.success).toBeUndefined(); // not envelope-wrapped
  });

  // ── 404 / localization ──────────────────────────────────────

  it('GET /nonexistent → 404 error envelope with NOT_FOUND and traceId', async () => {
    const res = await request(app.getHttpServer()).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.traceId).toBeTruthy();
  });

  it('GET /nonexistent Accept-Language: ar → Arabic message', async () => {
    const res = await request(app.getHttpServer())
      .get('/nonexistent')
      .set('Accept-Language', 'ar');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('المورد غير موجود');
  });

  it('GET /nonexistent Accept-Language: en → English message', async () => {
    const res = await request(app.getHttpServer())
      .get('/nonexistent')
      .set('Accept-Language', 'en');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Resource not found');
  });

  // ── Validation (Zod 422) ────────────────────────────────────

  it('POST /dev/echo invalid body → 422 VALIDATION_FAILED with details[]', async () => {
    const res = await request(app.getHttpServer()).post('/dev/echo').send({ message: 123 });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details[0].field).toBe('message');
  });

  it('POST /dev/echo valid body → 201 echo', async () => {
    const res = await request(app.getHttpServer())
      .post('/dev/echo')
      .send({ message: 'hello مرحبا' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.echo).toBe('hello مرحبا');
  });

  // ── Rate limiting ────────────────────────────────────────────

  it('GET /dev/rate-test x5 → 200; x6 → 429 RATE_LIMITED (with x-device-id)', async () => {
    const deviceId = `e2e-test-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .get('/dev/rate-test')
        .set('x-device-id', deviceId);
      // Degraded (no Redis) → always 200; with Redis the first 5 are 200.
      expect([200]).toContain(res.status);
    }
    // 6th call: 429 when Redis is up; 200 when degraded.
    const sixth = await request(app.getHttpServer())
      .get('/dev/rate-test')
      .set('x-device-id', deviceId);
    expect([200, 429]).toContain(sixth.status);
    if (sixth.status === 429) {
      expect(sixth.body.error.code).toBe('RATE_LIMITED');
      expect(sixth.headers['retry-after']).toBeTruthy();
    }
  });

  it('GET /dev/rate-test without x-device-id → 200 (keys by IP only)', async () => {
    const res = await request(app.getHttpServer()).get('/dev/rate-test');
    expect([200, 429]).toContain(res.status);
  });

  // ── Request-id round-trip ───────────────────────────────────

  it('x-request-id sent by client is echoed back in meta and header', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'fixed-test-id-123');
    expect(res.headers['x-request-id']).toBe('fixed-test-id-123');
    expect(res.body.meta.requestId).toBe('fixed-test-id-123');
  });

  // ── BullMQ job enqueue ──────────────────────────────────────

  it('POST /dev/jobs/run/echo → 201 { enqueued: true } when Redis up, 503 when down', async () => {
    const res = await request(app.getHttpServer()).post('/dev/jobs/run/echo').send({});
    expect([201, 503]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.data.enqueued).toBe(true);
    }
    if (res.status === 503) {
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    }
  }, 10000); // 10s to allow the 3s queue timeout + margin
});
