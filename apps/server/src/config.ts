/**
 * Server configuration from the environment. Every variable is listed in `.env.example`.
 * Optional integrations switch on when their variables are present (CLAUDE.md, "Credentials").
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  /** Public origin, e.g. https://caishy.example.com — used for cookies, links and web push. */
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  /** Where uploads live when S3 is not configured (mount a volume here in production). */
  DATA_DIR: z.string().default('./data'),
  /** Directory of the exported web app to serve at `/`. */
  WEB_DIR: z.string().optional(),
  /** Extra origins allowed to call the API with credentials (the Expo dev server in development). */
  CORS_ORIGINS: z.string().default(''),
  SESSION_DAYS: z.coerce.number().int().positive().default(90),
  TRUST_PROXY: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Bearer token for GET /metrics. Without it the endpoint is disabled. */
  METRICS_TOKEN: z.string().optional(),
  /** Minimum age at sign-up (R29): 13 by default, 16 where local law requires. */
  MINIMUM_AGE: z.coerce.number().int().min(13).max(21).default(13),
  /** Web Push. Generated and stored on first boot when absent. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:hello@caishy.com'),
  /** Expo push access token (mobile push). */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** AI assist (Anthropic). */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  /** Run background workers in this process. */
  WORKERS: bool.default(true),
});

export type Config = z.infer<typeof Env> & {
  corsOrigins: string[];
  isProduction: boolean;
  isTest: boolean;
  secureCookies: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const c = parsed.data;
  return {
    ...c,
    corsOrigins: c.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    isProduction: c.NODE_ENV === 'production',
    isTest: c.NODE_ENV === 'test',
    secureCookies: c.PUBLIC_URL.startsWith('https://'),
  };
}
