import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';

/**
 * Phase 0 foundation smoke test. Verifies the app boots (even with DB/Redis down
 * — degraded mode) and the cross-cutting conventions hold: response envelope,
 * localized errors, Zod validation, Swagger, health endpoints. Run with:
 *   npm run test:e2e
 * These mirror the Phase 0 Postman folder (architecture §0 + Phases doc P00).
 */
describe('MARBOU API — Phase 0 foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns a 200 liveness envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.meta.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /health/ready reports dependency probes (degraded without DB/Redis)', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.data).toHaveProperty('db');
    expect(res.body.data).toHaveProperty('redis');
    expect(res.body.data).toHaveProperty('storage');
  });

  it('GET /api/docs-json returns valid OpenAPI JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.info.title).toBe('MARBOU API');
    // Swagger JSON must NOT be wrapped in the success envelope.
    expect(res.body.success).toBeUndefined();
  });

  it('GET /nonexistent returns a 404 error envelope with NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.traceId).toBeTruthy();
  });

  it('GET /nonexistent localises the message for Arabic', async () => {
    const res = await request(app.getHttpServer()).get('/nonexistent').set('Accept-Language', 'ar');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('المورد غير موجود');
  });

  it('GET /nonexistent localises the message for English', async () => {
    const res = await request(app.getHttpServer()).get('/nonexistent').set('Accept-Language', 'en');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Resource not found');
  });

  it('POST /dev/echo with an invalid body returns 422 with details[]', async () => {
    const res = await request(app.getHttpServer()).post('/dev/echo').send({ message: 123 });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details[0].field).toBe('message');
  });

  it('POST /dev/echo with a valid body echoes the message', async () => {
    const res = await request(app.getHttpServer()).post('/dev/echo').send({ message: 'hello' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.echo).toBe('hello');
  });

  it('GET /dev/rate-test responds (degrades open without Redis)', async () => {
    const res = await request(app.getHttpServer()).get('/dev/rate-test');
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('envelopes carry a request id echoed back to the client', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'fixed-test-id-123');
    expect(res.headers['x-request-id']).toBe('fixed-test-id-123');
    expect(res.body.meta.requestId).toBe('fixed-test-id-123');
  });
});
