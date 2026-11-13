import { envSchema, type Env } from './env.schema';

/**
 * Environment is validated once and memoised. `main.ts` calls `loadEnv()` first so
 * invalid config fails fast at bootstrap; every other module imports the
 * `configuration` proxy, which reads the cached validated values (NFR-SEC-08).
 */
let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Validated config accessor. Triggers validation on first access. */
export const configuration: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return (loadEnv() as Record<string, unknown>)[prop];
  },
}) as Env;

export type AppConfig = Env;
