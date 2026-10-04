/**
 * Server configuration from the environment. Every variable is listed in `.env.example`.
 * Optional integrations switch on when their variables are present (CLAUDE.md, "Credentials").
 */
import { z } from 'zod';
import { parseOperatorTokens } from './lib/operator';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/** A page people open: an http(s) address, never another scheme. */
const webPage = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'an http(s) address');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  /** Public origin, e.g. https://caime.example.com — used for cookies, links and web push. */
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
  VAPID_SUBJECT: z.string().default('mailto:hello@cai.me'),
  /** Expo push access token (mobile push). */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Where mail goes out (smtps://user:pass@host:465, or smtp:// with STARTTLS). Off if unset. */
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default('Caime <hello@cai.me>'),
  /** AI assist (Anthropic). Off without a key; each person still turns it on for themselves. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  /**
   * A smaller model for the light features (rewrite, translate, catch me up), which are short,
   * frequent and forgiving; unset, they use ANTHROPIC_MODEL. Finding follow-ups and the
   * organizations' agents always use ANTHROPIC_MODEL.
   */
  ANTHROPIC_MODEL_LIGHT: z.string().optional(),
  /** Another Messages API endpoint (a gateway, or the local stub the tests run). */
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  /** Run background workers in this process. */
  WORKERS: bool.default(true),
  /**
   * Database backups (docs/DEPLOY.md, "Backups"): a `pg_dump` by a worker instance every
   * BACKUP_EVERY_HOURS, kept BACKUP_KEEP_DAYS in BACKUP_DIR (DATA_DIR/backups unless set), each
   * checked with `pg_restore --list` as it's made. Off only where something else backs up.
   */
  BACKUP_ENABLED: bool.default(true),
  BACKUP_DIR: z.string().optional(),
  BACKUP_EVERY_HOURS: z.coerce.number().int().positive().default(24),
  BACKUP_KEEP_DAYS: z.coerce.number().int().positive().default(30),
  /**
   * A copy of each backup off the host, to any S3-compatible bucket (docs/DEPLOY.md,
   * "Backups"): all four set, each dump is put there once it's checked; none set, backups stay
   * on the volume alone. The bucket's own lifecycle rule keeps or expires the copies.
   */
  BACKUP_S3_ENDPOINT: z.string().url().optional(),
  BACKUP_S3_BUCKET: z.string().min(1).optional(),
  BACKUP_S3_REGION: z.string().min(1).default('auto'),
  BACKUP_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Where in the bucket (`caime/backups/`), so one bucket may hold more than Caime's. */
  BACKUP_S3_PREFIX: z.string().default('caime/backups/'),
  BACKUP_S3_PATH_STYLE: bool.default(true),
  /**
   * Files in an S3-compatible bucket (docs/DEPLOY.md, "Scaling") rather than on DATA_DIR: all
   * four set, what's uploaded is kept there (uploads in progress stay on the instance's disk
   * until they're done); none set, files stay on the volume. The bucket is never public.
   */
  FILES_S3_ENDPOINT: z.string().url().optional(),
  FILES_S3_BUCKET: z.string().min(1).optional(),
  FILES_S3_REGION: z.string().min(1).default('auto'),
  FILES_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  FILES_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Where in the bucket (`caime/files/`), so one bucket may hold more than Caime's. */
  FILES_S3_PREFIX: z.string().default('caime/files/'),
  FILES_S3_PATH_STYLE: bool.default(true),
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
  /**
   * A token for each person on the operator's side (`mona:token,ali:token`, each 24 characters
   * or more), so the audit log says who acted; the routes ADMIN_TOKEN opens, and one can be
   * taken back without touching the others'.
   */
  OPERATOR_TOKENS: z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      const parsed = parseOperatorTokens(v);
      if ('problem' in parsed)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `name:token pairs; ${parsed.problem}`,
        });
    }),
  /** Where people see plans and upgrade (a pricing page or a payment link), shown in the app. */
  PLANS_URL: z.string().url().optional(),
  /**
   * Who runs this Caime, and where people write to them, as its own privacy, terms and help
   * pages say (PUBLIC_URL/privacy, /terms, /help).
   */
  LEGAL_NAME: z.string().trim().min(1).max(120).default('DATA C OÜ'),
  CONTACT_EMAIL: z.string().email().default('hello@cai.me'),
  /**
   * Who hosts this Caime, as the privacy page's list of processors names it (R54): the company
   * and where, "Hetzner Online GmbH, Germany". Unset, the page says "our hosting provider".
   */
  HOSTING_PROVIDER: z.string().trim().min(1).max(160).optional(),
  /**
   * The privacy policy, the terms and help, when they're published somewhere else (full http(s)
   * addresses): About links there, and Caime's own page for it sends people there too, so there
   * is only ever one of each. Without one, it's Caime's own page.
   */
  PRIVACY_URL: webPage.optional(),
  TERMS_URL: webPage.optional(),
  HELP_URL: webPage.optional(),
  /**
   * Billing (R25): Stripe's secret (or restricted) key, and the signing secret of the webhook
   * endpoint Stripe sends to at /v1/billing/webhook. Plans can be bought in the app only with
   * both; the prices are Stripe's own, found by their lookup keys (docs/DEPLOY.md).
   */
  STRIPE_SECRET_KEY: z.string().min(20).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  /** Another Stripe API origin (the local stub the tests run). */
  STRIPE_API_BASE: z.string().url().default('https://api.stripe.com'),
  /** The customer portal configuration to open (bpc_…); without it, the account's default. */
  STRIPE_PORTAL_CONFIGURATION: z.string().optional(),
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
  /**
   * Or Cloudflare's TURN relay: a TURN key's id and its API token (Cloudflare dashboard, Realtime,
   * TURN Server). Each person gets credentials of their own that expire, asked of Cloudflare when
   * a call starts; if it doesn't answer, calls go on with STUN only.
   */
  CLOUDFLARE_TURN_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_TURN_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_TURN_API_BASE: z.string().url().default('https://rtc.live.cloudflare.com'),
});

export type Config = z.infer<typeof Env> & {
  corsOrigins: string[];
  stunUrls: string[];
  turnUrls: string[];
  /** Cloudflare's relay, when both its key id and token are set. */
  cloudflareTurn: { keyId: string; token: string } | null;
  isProduction: boolean;
  isTest: boolean;
  secureCookies: boolean;
  /** About's links: PRIVACY_URL, TERMS_URL and HELP_URL, or Caime's own page for each. */
  aboutLinks: { privacyUrl: string; termsUrl: string; helpUrl: string };
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
  const own = (page: string) => `${c.PUBLIC_URL.replace(/\/+$/, '')}/${page}`;
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
    cloudflareTurn:
      c.CLOUDFLARE_TURN_KEY_ID && c.CLOUDFLARE_TURN_API_TOKEN
        ? { keyId: c.CLOUDFLARE_TURN_KEY_ID, token: c.CLOUDFLARE_TURN_API_TOKEN }
        : null,
    isProduction: c.NODE_ENV === 'production',
    isTest: c.NODE_ENV === 'test',
    secureCookies: c.PUBLIC_URL.startsWith('https://'),
    aboutLinks: {
      privacyUrl: c.PRIVACY_URL ?? own('privacy'),
      termsUrl: c.TERMS_URL ?? own('terms'),
      helpUrl: c.HELP_URL ?? own('help'),
    },
  };
}
