/**
 * Provider health (R78). Every provider Caime talks to sits behind one interface with a
 * stand-in the tests run against; this is the live side of that contract. Once an hour, each
 * configured provider's cheapest authenticated read is called once (a balance, a model list,
 * a mail server's name, push receipts for no tickets, a minute's relay credentials, the head of
 * a key that isn't there, a TXT lookup) within ten seconds, in parallel, and the answer goes on
 * `/metrics` as `caime_provider_up{provider}` and `caime_provider_latency_seconds{provider}`,
 * and to the operator through `GET /v1/admin/providers` (`POST …/check` runs it now). Drift, an
 * answer that no longer parses, is a probe that throws: the gauge goes down before a customer
 * sees it.
 * Labels are the fixed ids below, never a host or a key.
 */

import type { ProviderHealthView } from '@caime/core/api';
import { SUB_PROCESSORS } from '@caime/core/processors';
import type { AppContext } from '../context';
import { backupBucket } from './backup';

/** The last probes, shared by every instance (`lib/gauges.ts` reads them on scrape). */
export const PROVIDERS_SETTING = 'providers.last';

import { ACCOUNT_PROVIDER_NAMES } from '@caime/core/accounts';
import { AGE_PROVIDER_NAMES } from './age-provider';
import { cloudflareIceRequest } from './calls';
import { expoPush } from './expo-push';
import { registerPeriodic } from './jobs';
import { MAIL_PROVIDER_NAMES } from './mail-provider';
import { type ProviderHealth, providerState } from './metrics';
import { postForm, providerClient } from './provider-consent';
import { s3Head } from './s3';
import { readSettings, writeSetting } from './settings';
import { SPEECH_PROVIDER_NAMES } from './speech';
import { filesBucket } from './storage';
import { stripe } from './stripe';
import { TTS_PROVIDER_NAMES } from './tts';
import { whatsappFor } from './whatsapp';

export const PROVIDERS = [
  'stripe',
  'anthropic',
  'speech',
  'tts',
  'smtp',
  'mail-in',
  'expo',
  'cloudflare',
  'files-s3',
  'backup-s3',
  'dns',
  'whatsapp',
  'age',
  'google',
  'microsoft',
] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** A probe's whole time, including a provider that never answers. */
export const PROBE_MS = 10_000;
export const PROBE_EVERY_MS = 3_600_000;

export interface ProviderProbe {
  id: ProviderId;
  /** Who it is, for the operator: the processors list's name, or the host. */
  name: string;
  check: () => Promise<void>;
}

const processorName = (id: string) => SUB_PROCESSORS.find((p) => p.id === id)?.name ?? id;
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** A lookup that answered "no such record" answered: the resolver is there. */
const DNS_ANSWERED = new Set(['ENODATA', 'ENOTFOUND']);

/** The probes for what this Caime is configured with, in a fixed order. */
export function providerProbes(ctx: AppContext): ProviderProbe[] {
  const { config } = ctx;
  const probes: ProviderProbe[] = [];
  const s = stripe(ctx);
  if (s)
    probes.push({
      id: 'stripe',
      name: processorName('stripe'),
      check: async () => {
        await s.get('/v1/balance');
      },
    });
  const ai = ctx.ai;
  if (ai)
    probes.push({ id: 'anthropic', name: processorName('anthropic'), check: () => ai.ping() });
  const speech = ctx.speech;
  if (speech)
    probes.push({
      id: 'speech',
      name: SPEECH_PROVIDER_NAMES[speech.provider],
      check: () => speech.ping(),
    });
  const tts = ctx.tts;
  if (tts)
    probes.push({ id: 'tts', name: TTS_PROVIDER_NAMES[tts.provider], check: () => tts.ping() });
  const age = ctx.age;
  if (age) probes.push({ id: 'age', name: AGE_PROVIDER_NAMES[age.id], check: () => age.ping() });
  const whatsapp = whatsappFor(config);
  if (whatsapp)
    probes.push({ id: 'whatsapp', name: 'WhatsApp (Meta)', check: () => whatsapp.ping() });
  // Google's and Microsoft's sign-in for connected accounts (M16 G2): their token address asked
  // to renew a refresh token that can't exist. `invalid_grant` is the answer of a provider that's
  // there and didn't turn Caime's client away; anything else (`invalid_client`: its id or secret
  // isn't taken) is down.
  for (const p of ['google', 'microsoft'] as const) {
    const client = providerClient(config, p);
    if (client)
      probes.push({
        id: p,
        name: ACCOUNT_PROVIDER_NAMES[p],
        check: async () => {
          const { status, body } = await postForm(client.token, {
            client_id: client.id,
            client_secret: client.secret,
            grant_type: 'refresh_token',
            refresh_token: 'caime-health-probe',
          });
          if (body.error !== 'invalid_grant')
            throw new Error(`It answered ${status} ${String(body.error ?? '')}`.trim());
        },
      });
  }
  const mail = ctx.mail;
  if (mail && config.SMTP_URL)
    probes.push({ id: 'smtp', name: hostOf(config.SMTP_URL), check: () => mail.verify() });
  const mailIn = ctx.mailProvider;
  if (mailIn)
    probes.push({
      id: 'mail-in',
      name: MAIL_PROVIDER_NAMES[mailIn.name],
      check: () => mailIn.ping(),
    });
  // The phones' pushes: with a token, what it vouches for (receipts for no tickets).
  if (config.EXPO_ACCESS_TOKEN) {
    const expo = expoPush(config);
    probes.push({ id: 'expo', name: processorName('expo'), check: () => expo.ping() });
  }
  if (config.cloudflareTurn)
    probes.push({
      id: 'cloudflare',
      name: processorName('cloudflare'),
      check: async () => {
        const res = await cloudflareIceRequest(ctx, 60);
        if (!res.ok) throw new Error(`Cloudflare answered ${res.status}`);
      },
    });
  const files = filesBucket(config);
  if (files)
    probes.push({
      id: 'files-s3',
      name: hostOf(files.endpoint),
      // A key that isn't there: a signed answer either way (404), a bad key or scope a refusal.
      check: async () => {
        await s3Head(files, `${config.FILES_S3_PREFIX}.health`);
      },
    });
  const backups = backupBucket(config);
  if (backups)
    probes.push({
      id: 'backup-s3',
      name: hostOf(backups.endpoint),
      check: async () => {
        await s3Head(backups, `${config.BACKUP_S3_PREFIX}.health`);
      },
    });
  probes.push({
    id: 'dns',
    name: config.DNS_SERVERS ?? 'system resolver',
    check: async () => {
      try {
        await ctx.dns.resolveTxt(hostOf(config.PUBLIC_URL));
      } catch (err) {
        if (!DNS_ANSWERED.has(String((err as { code?: string }).code))) throw err;
      }
    },
  });
  return probes;
}

/** What a failure said, for the operator: clipped, and never a credential in an address. */
export function errorLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\/\/[^/@\s]+@/g, '//…@').slice(0, 200);
}

const withinProbe = <T>(p: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no answer in ${PROBE_MS / 1000} s`)),
      PROBE_MS,
    );
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** Run every probe once, in parallel; record each outcome; say what's down in the log. */
export async function checkProviders(ctx: AppContext): Promise<ProviderHealthView[]> {
  const probes = providerProbes(ctx);
  // What the last check found, wherever it ran: down twice in a row is down (M17 I15b).
  const before =
    (await readSettings<Record<string, ProviderHealth>>(ctx.db, [PROVIDERS_SETTING])).get(
      PROVIDERS_SETTING,
    ) ?? {};
  await Promise.all(
    probes.map(async (probe) => {
      const started = Date.now();
      let state: ProviderHealth;
      try {
        await withinProbe(probe.check());
        state = { up: true, latencyMs: Date.now() - started, checkedAt: Date.now(), error: null };
      } catch (err) {
        const last = before[probe.id];
        state = {
          up: false,
          latencyMs: Date.now() - started,
          checkedAt: Date.now(),
          error: errorLine(err),
          downs: (last && !last.up ? (last.downs ?? 1) : 0) + 1,
        };
        ctx.log.warn({ provider: probe.id, detail: state.error }, 'provider down');
      }
      providerState.set(probe.id, state);
    }),
  );
  // Every instance's /metrics says so, not only the one that probed.
  await writeSetting(ctx.db, PROVIDERS_SETTING, Object.fromEntries(providerState), ctx.now());
  return providersView(ctx);
}

/** The configured providers as their last probe found them. */
export function providersView(ctx: AppContext): ProviderHealthView[] {
  return providerProbes(ctx).map((probe) => {
    const s = providerState.get(probe.id);
    return {
      id: probe.id,
      name: probe.name,
      up: s?.up ?? null,
      latencyMs: s?.latencyMs ?? null,
      checkedAt: s ? new Date(s.checkedAt).toISOString() : null,
      error: s?.error ?? null,
    };
  });
}

/** Hourly, in the background, when the operator hasn't turned it off. */
export function registerProviderHealth(): void {
  registerPeriodic({
    name: 'provider.health',
    everyMs: PROBE_EVERY_MS,
    background: true,
    run: async (ctx) => {
      if (!ctx.config.PROVIDER_HEALTH_ENABLED) return;
      await checkProviders(ctx);
    },
  });
}
