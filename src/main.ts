import { createApp } from './bootstrap';
import { Logger } from 'nestjs-pino';
import { loadEnv } from './config/configuration';

/**
 * Production entrypoint. Creates the wired app (env validation, helmet, CORS,
 * Swagger, pino logger — see bootstrap.ts) and listens on PORT.
 */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = loadEnv();
  await app.listen(config.PORT);
  app.get(Logger).log(`MARBOU API listening on :${config.PORT} (${config.NODE_ENV})`);
}

bootstrap().catch((err) => {
  console.error('Failed to start MARBOU API:', err);
  process.exit(1);
});
