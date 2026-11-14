import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { loadEnv } from './config/configuration';
import { SWAGGER_PATH } from './config/constants';
import { initSentry } from './integrations/monitoring/sentry';

/**
 * createApp — shared bootstrap used by `main.ts` (listen) and the e2e tests
 * (init + supertest), so they exercise identical wiring (architecture §3):
 * env validation, Sentry, pino logger, global prefix, helmet, compression,
 * CORS allow-list and Swagger at /api/docs.
 */
export async function createApp(): Promise<INestApplication> {
  const config = loadEnv(); // fail-fast env validation (NFR-SEC-08)
  initSentry();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Disable Express's automatic weak ETag so our ETagInterceptor is the only
  // one setting it (otherwise Express's W/"..." overrides our strong SHA-256 ETag).
  (app.getHttpAdapter().getInstance() as any).set('etag', false);

  // API controllers carry the `api/v1/` prefix in their @Controller() path (see
  // API_PREFIX). Health and dev helpers stay at the root. We deliberately do NOT
  // use setGlobalPrefix: with a global prefix Nest mounts the not-found handler
  // only under the prefix, so unmatched root paths would bypass the exception
  // filter and return Express's default "Cannot GET ...". Keeping everything
  // under one root router lets the AllExceptionsFilter localise every 404.

  // Security headers + compression (NFR-SEC-09, NFR-NET-03).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  // CORS allow-list.
  app.enableCors({
    origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI/Swagger at /api/docs (JSON at /api/docs-json) — SYS-04.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MARBOU API')
    .setDescription('MARBOU multi-vertical marketplace backend API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document);

  app.enableShutdownHooks();
  return app;
}
