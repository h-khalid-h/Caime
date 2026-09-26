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
  /**
   * DNS servers for checking organizations' domains, e.g. `1.1.1.1,8.8.8.8` (a port may follow
   * each, as `127.0.0.1:8853`). Without it, the system's.
   */
  DNS_SERVERS: z.string().optional(),
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
  /** AI assist (Anthropic). Off without a key; each person still turns it on for themselves. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  /** Another Messages API endpoint (a gateway, or the local stub the tests run). */
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  /** Run background workers in this process. */
  WORKERS: bool.default(true),
  /**
   * Let webhooks reach private and loopback addresses, and plain http. For tests and local
   * development only: in production it would let an app probe the server's own network.
   */
  WEBHOOKS_ALLOW_PRIVATE: bool.default(false),
  /**
   * The operator's token for /v1/admin (setting plans, product metrics). Without it those routes
   * don't exist. Long and random: it can change anyone's plan.
   */
  ADMIN_TOKEN: z.string().min(24).optional(),
  /** Where people see plans and upgrade (a pricing page or a payment link), shown in the app. */
  PLANS_URL: z.string().url().optional(),
  /**
   * Calls (PRD §47): STUN servers that tell each side its public address, comma-separated.
   * Empty for none (then calls connect only on the same network).
   */
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  /**
   * A TURN relay for calls that can't connect directly (strict networks), comma-separated
   * `turn:`/`turns:` addresses, and the shared secret it checks time-limited credentials with
   * (coturn's `static-auth-secret`). Without them, some calls won't connect.
   */
  TURN_URLS: z.string().default(''),
  TURN_SECRET: z.string().min(16).optional(),
});

export type Config = z.infer<typeof Env> & {
  corsOrigins: string[];
  stunUrls: string[];
  turnUrls: string[];
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
  const list = (v: string) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    ...c,
    corsOrigins: list(c.CORS_ORIGINS),
    stunUrls: list(c.STUN_URLS),
    turnUrls: c.TURN_SECRET ? list(c.TURN_URLS) : [],
    isProduction: c.NODE_ENV === 'production',
    isTest: c.NODE_ENV === 'test',
    secureCookies: c.PUBLIC_URL.startsWith('https://'),
  };
}
