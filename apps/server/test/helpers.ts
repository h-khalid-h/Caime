import { randomBytes } from 'node:crypto';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { AppContext } from '../src/context';
import { adminUrl, TEMPLATE, urlFor } from './global-setup';

export interface TestApp {
  app: FastifyInstance;
  ctx: AppContext;
  clock: { now: Date; advance(ms: number): void; set(iso: string): void };
  close(): Promise<void>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const name = `caishy_t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database ${name} template ${TEMPLATE}`);
  await admin.end();
  const clock = {
    now: new Date('2026-09-23T14:00:00Z'),
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    },
    set(iso: string) {
      this.now = new Date(iso);
    },
  };
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: urlFor(name),
    DATABASE_POOL_MAX: '5',
    PUBLIC_URL: 'http://localhost:8787',
    DATA_DIR: `/tmp/${name}`,
    WORKERS: 'false',
    ...env,
  });
  const { app, ctx } = await buildApp(config, { now: () => clock.now, skipMigrations: true });
  await app.ready();
  return {
    app,
    ctx,
    clock,
    async close() {
      await app.close();
      const a = new pg.Client({ connectionString: adminUrl() });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

export interface Client {
  token: string;
  user: { id: string; handle: string; displayName: string; [k: string]: unknown };
  recoveryCodes: string[];
  req(
    method: InjectOptions['method'],
    url: string,
    body?: unknown,
  ): Promise<LightMyRequestResponse>;
  get<T = any>(url: string): Promise<T>;
  post<T = any>(url: string, body?: unknown): Promise<T>;
  patch<T = any>(url: string, body?: unknown): Promise<T>;
  del<T = any>(url: string): Promise<T>;
}

let counter = 0;

export async function signup(
  t: TestApp,
  patch: Partial<{
    displayName: string;
    handle: string;
    email: string;
    birthYear: number;
    locale: string;
    timeZone: string;
  }> = {},
): Promise<Client> {
  counter++;
  const handle = patch.handle ?? `user${counter}${randomBytes(2).toString('hex')}`;
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: {
      email: patch.email ?? `${handle}@example.com`,
      password: 'correct horse battery',
      displayName: patch.displayName ?? `User ${counter}`,
      handle,
      birthYear: patch.birthYear ?? 1990,
      timeZone: patch.timeZone ?? 'America/New_York',
      locale: patch.locale ?? 'en-US',
      client: 'native',
    },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed ${res.statusCode}: ${res.body}`);
  const body = res.json();
  return clientFor(t, body.token, body.user, body.recoveryCodes);
}

export function clientFor(
  t: TestApp,
  token: string,
  user: Client['user'],
  recoveryCodes: string[] = [],
): Client {
  const req = (method: InjectOptions['method'], url: string, body?: unknown) =>
    t.app.inject({
      method,
      url,
      payload: body as InjectOptions['payload'],
      headers: { authorization: `Bearer ${token}` },
    });
  const ok = async (res: LightMyRequestResponse) => {
    if (res.statusCode >= 400) throw new Error(`${res.statusCode} ${res.body}`);
    return res.body ? res.json() : undefined;
  };
  return {
    token,
    user,
    recoveryCodes,
    req,
    get: async (url) => ok(await req('GET', url)),
    post: async (url, body) => ok(await req('POST', url, body ?? {})),
    patch: async (url, body) => ok(await req('PATCH', url, body ?? {})),
    del: async (url) => ok(await req('DELETE', url)),
  };
}
