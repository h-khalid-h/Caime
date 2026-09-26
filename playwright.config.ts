/**
 * End-to-end tests against the production build: the bundled server serving the exported web
 * app on one origin, exactly as deployed. `pnpm build` first, then `pnpm e2e`.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_TOKEN, DNS_STUB, METRICS_TOKEN } from './e2e/helpers';

const PORT = Number(process.env.E2E_PORT ?? 8787);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
/** A stand-in for the Messages API (e2e/anthropic-stub.mjs), so AI assist runs without a key. */
const AI_STUB = `http://127.0.0.1:${Number(process.env.E2E_AI_STUB_PORT ?? 8799)}`;
const DNS_PORT = Number(process.env.E2E_DNS_PORT ?? 8853);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write', 'camera', 'microphone'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Calls: a test pattern and a tone stand in for a camera and a microphone.
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node e2e/anthropic-stub.mjs',
          url: `${AI_STUB}/health`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: new URL(AI_STUB).port },
        },
        {
          command: 'node e2e/dns-stub.mjs',
          url: `${DNS_STUB}/health`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: new URL(DNS_STUB).port, DNS_PORT: String(DNS_PORT) },
        },
        {
          command: 'node --enable-source-maps apps/server/dist/server.js',
          url: `${BASE}/v1/readyz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NODE_ENV: 'production',
            PORT: String(PORT),
            HOST: '127.0.0.1',
            PUBLIC_URL: BASE,
            DATABASE_URL:
              process.env.E2E_DATABASE_URL ??
              'postgres://caishy:caishy-dev@127.0.0.1:5432/caishy_e2e',
            DATA_DIR: join(tmpdir(), 'caishy-e2e'),
            WEB_DIR: 'apps/app/dist',
            LOG_LEVEL: 'warn',
            ANTHROPIC_API_KEY: 'e2e-stub',
            ANTHROPIC_BASE_URL: AI_STUB,
            ADMIN_TOKEN,
            METRICS_TOKEN,
            DNS_SERVERS: `127.0.0.1:${DNS_PORT}`,
            // Calls between two browsers on this machine need no STUN server out there.
            STUN_URLS: '',
          },
        },
      ],
});
