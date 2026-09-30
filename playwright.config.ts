/**
 * End-to-end tests against the production build: the bundled server serving the exported web
 * app on one origin, exactly as deployed. `pnpm build` first, then `pnpm e2e`.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_TOKEN, DNS_STUB, METRICS_TOKEN } from './e2e/helpers';

// Going offline and routing reach the service worker's own requests too, so a test that says
// the app opens with no network shows it did, from what the worker kept.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= '1';

const PORT = Number(process.env.E2E_PORT ?? 8787);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
/** A stand-in for the Messages API (e2e/anthropic-stub.mjs), so AI assist runs without a key. */
const AI_STUB = `http://127.0.0.1:${Number(process.env.E2E_AI_STUB_PORT ?? 8799)}`;
const DNS_PORT = Number(process.env.E2E_DNS_PORT ?? 8853);
const SMTP_STUB = `http://127.0.0.1:${Number(process.env.E2E_SMTP_STUB_PORT ?? 8795)}`;
const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 8825);
/** A stand-in for Stripe (e2e/stripe-stub.mjs): its Checkout and portal pages, and its API. */
const STRIPE_STUB = `http://127.0.0.1:${Number(process.env.E2E_STRIPE_STUB_PORT ?? 8796)}`;
const STRIPE_KEY = 'sk_test_e2e_0123456789abcdef';
const STRIPE_WEBHOOK_SECRET = 'whsec_e2e_0123456789abcdef';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    // What CI's machines are, pinned so a run anywhere is the same run: the country sign-up
    // suggests (from the time zone, else the language) and every date and time shown depend on it.
    locale: 'en-US',
    timezoneId: 'UTC',
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
          command: 'node e2e/smtp-stub.mjs',
          url: `${SMTP_STUB}/health`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: new URL(SMTP_STUB).port, SMTP_PORT: String(SMTP_PORT) },
        },
        {
          command: 'node e2e/stripe-stub.mjs',
          url: `${STRIPE_STUB}/health`,
          reuseExistingServer: !process.env.CI,
          env: {
            PORT: new URL(STRIPE_STUB).port,
            STRIPE_KEY,
            WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
            WEBHOOK_URL: `${BASE}/v1/billing/webhook`,
          },
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
            DATA_DIR: join(tmpdir(), 'caime-e2e'),
            WEB_DIR: 'apps/app/dist',
            LOG_LEVEL: 'warn',
            ANTHROPIC_API_KEY: 'e2e-stub',
            ANTHROPIC_BASE_URL: AI_STUB,
            ADMIN_TOKEN,
            METRICS_TOKEN,
            DNS_SERVERS: `127.0.0.1:${DNS_PORT}`,
            SMTP_URL: `smtp://127.0.0.1:${SMTP_PORT}`,
            EMAIL_FROM: 'Caime <hello@caime.test>',
            // Calls between two browsers on this machine need no STUN server out there.
            STUN_URLS: '',
            // Help is published somewhere else; the privacy policy and the terms are Caime's own.
            HELP_URL: 'https://policies.example/help',
            STRIPE_SECRET_KEY: STRIPE_KEY,
            STRIPE_WEBHOOK_SECRET,
            STRIPE_API_BASE: STRIPE_STUB,
          },
        },
      ],
});
