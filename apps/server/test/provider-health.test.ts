import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { providerState } from '../src/lib/metrics';
import { errorLine, PROVIDERS, providerProbes } from '../src/lib/provider-health';
import { createTestApp, type TestApp } from './helpers';

/**
 * Provider health (R78): each configured provider's cheapest read, once an hour, on /metrics
 * and for the operator. Stand-ins here answer as the providers do, one of them badly.
 */
let t: TestApp;
let well: Server;
let badly: Server;
const ADMIN = 'operator-token-0123456789abcdef';
const METRICS = 'metrics-token-0123456789abcdef';
const seen: string[] = [];

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );
const admin = (method: 'GET' | 'POST', url: string) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${ADMIN}` } });

beforeAll(async () => {
  well = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/v1/balance')
      return res.end(JSON.stringify({ object: 'balance', available: [] }));
    if (req.method === 'GET' && req.url === '/v1/models/gpt-4o-transcribe')
      return res.end(JSON.stringify({ id: 'gpt-4o-transcribe', object: 'model' }));
    if (req.method === 'GET' && req.url === '/server')
      return res.end(JSON.stringify({ ID: 1, Name: 'caime' }));
    res.statusCode = 404;
    res.end('{}');
  });
  badly = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.statusCode = 500;
    res.end('{"type":"error"}');
  });
  const [good, bad] = await Promise.all([listen(well), listen(badly)]);
  t = await createTestApp({
    ADMIN_TOKEN: ADMIN,
    METRICS_TOKEN: METRICS,
    PROVIDER_HEALTH_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_0123456789abcdef0123456789',
    STRIPE_API_BASE: good,
    ANTHROPIC_API_KEY: 'stand-in',
    ANTHROPIC_BASE_URL: bad,
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'stand-in',
    SPEECH_BASE_URL: good,
    MAIL_DOMAIN: 'mail.example',
    MAIL_PROVIDER: 'postmark',
    MAIL_PROVIDER_TOKEN: 'stand-in',
    MAIL_BASE_URL: good,
  });
  t.ctx.dns = {
    resolveTxt: async () => {
      throw Object.assign(new Error('queryTxt ENODATA localhost'), { code: 'ENODATA' });
    },
  };
});

afterAll(async () => {
  await t.close();
  well.close();
  badly.close();
});

describe('provider health (R78)', () => {
  it('probes what is configured, by a fixed id, and nothing else', () => {
    const ids = providerProbes(t.ctx).map((p) => p.id);
    expect(ids).toEqual(['stripe', 'anthropic', 'speech', 'mail-in', 'dns']);
    for (const id of ids) expect(PROVIDERS).toContain(id);
    expect(providerProbes(t.ctx).map((p) => p.name)).toEqual([
      'Stripe Payments Europe, Ltd.',
      'Anthropic, PBC',
      'OpenAI, LLC',
      'ActiveCampaign, LLC (Postmark)',
      'system resolver',
    ]);
  });

  it('nothing is known before a probe; the operator runs one and reads what each answered', async () => {
    const before = (await admin('GET', '/v1/admin/providers')).json().providers;
    expect(before.map((p: { up: boolean | null }) => p.up)).toEqual([null, null, null, null, null]);
    seen.length = 0;
    const res = await admin('POST', '/v1/admin/providers/check');
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(
      res.json().providers.map((p: { id: string }) => [p.id, p]),
    ) as Record<
      string,
      { up: boolean; latencyMs: number; checkedAt: string; error: string | null }
    >;
    expect(byId.stripe).toMatchObject({ up: true, error: null });
    expect(byId.speech).toMatchObject({ up: true, error: null });
    expect(byId['mail-in']).toMatchObject({ up: true, error: null });
    expect(byId.dns).toMatchObject({ up: true, error: null });
    expect(byId.anthropic?.up).toBe(false);
    expect(byId.anthropic?.error).toMatch(/500/);
    expect(byId.stripe?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(byId.stripe?.checkedAt).toMatch(/^2/);
    // One cheap read each, with the key the client uses.
    expect(seen.sort()).toEqual([
      'GET /server',
      'GET /v1/balance',
      'GET /v1/models/gpt-4o-transcribe',
      'GET /v1/models?limit=1',
    ]);
    const noted = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'admin.providers_checked')
      .executeTakeFirstOrThrow();
    expect(noted.metadata).toEqual({ operator: 'operator', down: ['anthropic'] });
  });

  it('is on /metrics by provider, and the hourly task keeps it current', async () => {
    const scrape = await t.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS}` },
    });
    expect(scrape.body).toMatch(/^caime_provider_up\{provider="stripe"\} 1$/m);
    expect(scrape.body).toMatch(/^caime_provider_up\{provider="anthropic"\} 0$/m);
    expect(scrape.body).toMatch(/^caime_provider_latency_seconds\{provider="dns"\} 0(\.\d+)?$/m);
    providerState.clear();
    await runPeriodic(t.ctx);
    expect([...providerState.keys()].sort()).toEqual([
      'anthropic',
      'dns',
      'mail-in',
      'speech',
      'stripe',
    ]);
  });

  it('a failure’s line never carries a credential in an address', () => {
    expect(errorLine(new Error('connect to https://user:secret@smtp.example:587 failed'))).toBe(
      'connect to https://…@smtp.example:587 failed',
    );
    expect(errorLine('x'.repeat(300))).toHaveLength(200);
  });
});
