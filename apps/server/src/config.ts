/**
 * Server configuration from the environment. Every variable is listed in `.env.example`.
 * Optional integrations switch on when their variables are present (CLAUDE.md, "Credentials").
 */
import { z } from 'zod';
import { parseOperatorTokens } from './lib/operator';
import { key32 } from './lib/vault';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/** A page people open: an http(s) address, never another scheme. */
const webPage = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'an http(s) address');

/** 32 random bytes as base64 or base64url (`openssl rand -base64 32`), the shape of every key. */
const secretKey = z
  .string()
  .refine((v) => key32(v) !== null, '32 random bytes as base64 (openssl rand -base64 32)');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  /** Public origin, e.g. https://caime.example.com — used for cookies, links and web push. */
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  /**
   * The commit this build is (A3): the image's `CAIME_VERSION` build argument, which CI sets to
   * the sha it tested, said on `/v1/healthz` so a deploy is verified by what answers, never by
   * a panel's status alone. A build made without it says `unknown`.
   */
  CAIME_VERSION: z.string().min(1).max(64).default('unknown'),
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
  /**
   * The phone apps' link to this domain (R35, `lib/app-links.ts`): Apple's team id, and the
   * SHA-256 fingerprints of the Android signing certificates (comma separated, as Play Console
   * shows them). Unset, `/.well-known/apple-app-site-association` and `assetlinks.json` answer
   * 404 and links open in the browser.
   */
  APPLE_TEAM_ID: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .optional(),
  ANDROID_CERT_SHA256: z
    .string()
    .regex(
      /^\s*[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}\s*(,\s*[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}\s*)*$/,
    )
    .optional(),
  /** Expo's push service (`lib/expo-push.ts`): another only for the local stand-in the tests run. */
  EXPO_PUSH_URL: z.string().url().default('https://exp.host/--/api/v2/push'),
  /** Where mail goes out (smtps://user:pass@host:465, or smtp:// with STARTTLS). Off if unset. */
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default('Caime <hello@cai.me>'),
  /** AI assist (Anthropic). Off without a key; each person still turns it on for themselves. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  /**
   * A smaller model for the light features (rewrite, translate, catch me up), which are short,
   * frequent and forgiving; unset, they use ANTHROPIC_MODEL. Finding follow-ups and the
   * organizations' agents always use ANTHROPIC_MODEL.
   */
  ANTHROPIC_MODEL_LIGHT: z.string().optional(),
  /** Another Messages API endpoint (a gateway, or the local stub the tests run). */
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  /**
   * Speech to text for voice notes (PRD §46; docs/SPEECH.md): which provider, its key, and the
   * model (each provider's default when unset). Off without both the provider and the key; each
   * person's own AI assist switch still decides for their notes.
   */
  SPEECH_PROVIDER: z.enum(['openai', 'elevenlabs']).optional(),
  SPEECH_API_KEY: z.string().optional(),
  SPEECH_MODEL: z.string().optional(),
  /** Another endpoint for it (a gateway, or the local stand-in the tests run). */
  SPEECH_BASE_URL: z.string().url().optional(),
  /**
   * Caime Mail (R75): the domain every handle is an address at (handle@MAIL_DOMAIN), the
   * provider that receives and sends it, its token, and the secret its webhooks carry. Off
   * without the domain and the provider.
   */
  MAIL_DOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/)
    .optional(),
  MAIL_PROVIDER: z.enum(['postmark']).optional(),
  MAIL_PROVIDER_TOKEN: z.string().optional(),
  MAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Another endpoint for the provider's API (a gateway, or the local stand-in the tests run). */
  MAIL_BASE_URL: z.string().url().optional(),
  /**
   * Who takes the staff addresses at the mail domain (`postmaster@`, `abuse@`, `hello@`,
   * `support@`, …: `STAFF_ADDRESSES` in lib/mail-in.ts): a person's or an organization's handle,
   * Caime's own organization's included. Without it, mail to them is dropped like any reserved
   * name's.
   */
  MAIL_STAFF_HANDLE: z
    .string()
    .trim()
    .toLowerCase()
    .transform((h) => h.replace(/^@/, ''))
    .pipe(z.string().min(1))
    .optional(),
  /** Run background workers in this process. */
  WORKERS: bool.default(true),
  /** The hourly probe of each configured provider (R78, lib/provider-health.ts); tests turn it off. */
  PROVIDER_HEALTH_ENABLED: bool.default(true),
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
   * The key each backup is encrypted with before it's kept or copied off the host (M16 B5):
   * kept apart from the backups (a password manager, never the bucket), and needed to restore
   * one (`node dist/decrypt-backup.js`, docs/DEPLOY.md). Without it, dumps are kept plain.
   */
  BACKUP_KEY: secretKey.optional(),
  /**
   * The key connected accounts' tokens are sealed with (M16 B5), held here and never in the
   * database, so a dump of it opens nothing. Set once and kept: to replace it, the new one goes
   * here and the old one in VAULT_KEY_PREVIOUS until `caime_vault_sealed{key="older"}` is 0.
   * Without it the database's own key seals, as before.
   */
  VAULT_KEY: secretKey.optional(),
  VAULT_KEY_PREVIOUS: secretKey.optional(),
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
   * The operator's postal address, as data protection law asks a controller to give one
   * (docs/LEGAL-REVIEW-2026-10.md), and the law and courts the terms are under ("Estonia").
   * Unset, the pages leave them out and say so to the operator in the review.
   */
  LEGAL_ADDRESS: z.string().trim().min(1).max(240).optional(),
  GOVERNING_LAW: z.string().trim().min(1).max(80).optional(),
  /**
   * The register the operator is entered in and its number ("Estonian Commercial Register
   * 12345678"), as the EU's e-Commerce Directive (Art. 5) asks an online service to say where
   * anyone can find it. Unset, the pages leave it out.
   */
  LEGAL_REGISTRATION: z.string().trim().min(1).max(120).optional(),
  /**
   * Who hosts this Caime, as the privacy page's list of processors names it (R54): the company
   * and where, "Hetzner Online GmbH, Germany". Unset, the page says "our hosting provider".
   */
  HOSTING_PROVIDER: z.string().trim().min(1).max(160).optional(),
  /**
   * Whose network carries every request in front of the servers (a CDN or proxy that ends the
   * HTTPS connection: "Cloudflare, Inc."), as the privacy page's list of processors names it.
   * Unset, there is none to name.
   */
  EDGE_PROVIDER: z.string().trim().min(1).max(160).optional(),
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
   * An organization's own checkout (R65): the platform's Connect client id (ca_…), which with
   * STRIPE_SECRET_KEY lets an organization's owner connect its own Stripe account, and the
   * signing secret of the Connect webhook endpoint at /v1/checkout/stripe/webhook. Without the
   * client id, Pay cards are paid by the ways an organization lists, as before.
   */
  STRIPE_CONNECT_CLIENT_ID: z.string().min(10).optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(10).optional(),
  /** Another Connect origin (the local stub the tests run). */
  STRIPE_CONNECT_BASE: z.string().url().default('https://connect.stripe.com'),
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
  /**
   * Contacts read from someone's Google or Microsoft account, once, when they ask (R89): each
   * provider's OAuth client, a web application whose redirect address is
   * PUBLIC_URL/v1/contacts/accounts/google/back (or /microsoft/back). Without its id and secret
   * an account isn't offered; the phone's address book, the browser's picker and a file still are.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  /** Whose Microsoft accounts: `common` (work, school and personal), or one tenant's id. */
  MICROSOFT_TENANT: z
    .string()
    .regex(/^[A-Za-z0-9.-]+$/)
    .default('common'),
  /** The providers' consent, token and contacts addresses: others only for the tests' stand-in. */
  GOOGLE_AUTH_URL: z.string().url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_TOKEN_URL: z.string().url().default('https://oauth2.googleapis.com/token'),
  GOOGLE_PEOPLE_API: z.string().url().default('https://people.googleapis.com'),
  MICROSOFT_LOGIN_BASE: z.string().url().default('https://login.microsoftonline.com'),
  MICROSOFT_GRAPH_API: z.string().url().default('https://graph.microsoft.com'),
  /** Connected accounts (R90): who a Google account is, its calendar, and its revocation. */
  GOOGLE_USERINFO_URL: z.string().url().default('https://openidconnect.googleapis.com/v1/userinfo'),
  GOOGLE_CALENDAR_API: z.string().url().default('https://www.googleapis.com/calendar/v3'),
  GOOGLE_REVOKE_URL: z.string().url().default('https://oauth2.googleapis.com/revoke'),
  /**
   * Phone numbers proven by a code over WhatsApp (R91): Meta's WhatsApp Business Platform, its
   * Cloud API, with an approved authentication template. Off until the token and number are set.
   */
  WHATSAPP_TOKEN: z.string().min(20).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z
    .string()
    .regex(/^\d{6,30}$/)
    .optional(),
  WHATSAPP_TEMPLATE: z
    .string()
    .regex(/^[a-z0-9_]{1,512}$/)
    .default('caime_code'),
  /** The template's language as approved (one language: the code reads the same in any). */
  WHATSAPP_TEMPLATE_LANGUAGE: z
    .string()
    .regex(/^[a-z]{2}(_[A-Z]{2})?$/)
    .default('en_US'),
  WHATSAPP_API: z.string().url().default('https://graph.facebook.com/v21.0'),
  /** Files from a connected Google account (R90): its Drive, and Google's picker's own key. */
  GOOGLE_DRIVE_API: z.string().url().default('https://www.googleapis.com/drive/v3'),
  /** A browser key limited to the Picker API and this site, and the project's number. */
  GOOGLE_PICKER_API_KEY: z.string().min(10).optional(),
  GOOGLE_PICKER_APP_ID: z
    .string()
    .regex(/^\d{6,20}$/)
    .optional(),
});

export type Config = z.infer<typeof Env> & {
  corsOrigins: string[];
  stunUrls: string[];
  turnUrls: string[];
  /** Cloudflare's relay, when both its key id and token are set. */
  cloudflareTurn: { keyId: string; token: string } | null;
  /** VAULT_KEY (and VAULT_KEY_PREVIOUS) as bytes, or null where the database's own key seals. */
  vaultKeys: { current: Buffer; previous: Buffer | null } | null;
  /** BACKUP_KEY as bytes, or null where backups are kept plain. */
  backupKey: Buffer | null;
  isProduction: boolean;
  isTest: boolean;
  /** The commit this build is (`CAIME_VERSION`), or `unknown`. */
  version: string;
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
  if (c.VAULT_KEY_PREVIOUS && !c.VAULT_KEY)
    throw new Error(
      'Invalid configuration:\n  VAULT_KEY_PREVIOUS: only beside a VAULT_KEY, the key that seals now',
    );
  const vaultKey = key32(c.VAULT_KEY);
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
    vaultKeys: vaultKey ? { current: vaultKey, previous: key32(c.VAULT_KEY_PREVIOUS) } : null,
    backupKey: key32(c.BACKUP_KEY),
    isProduction: c.NODE_ENV === 'production',
    isTest: c.NODE_ENV === 'test',
    version: c.CAIME_VERSION,
    secureCookies: c.PUBLIC_URL.startsWith('https://'),
    aboutLinks: {
      privacyUrl: c.PRIVACY_URL ?? own('privacy'),
      termsUrl: c.TERMS_URL ?? own('terms'),
      helpUrl: c.HELP_URL ?? own('help'),
    },
  };
}
