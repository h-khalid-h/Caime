import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Cookie-authenticated writes need this header (docs/SECURITY.md, CSRF). */
export const CLIENT = { 'x-caishy-client': 'web' };
export const PASSWORD = 'a long enough passphrase';
/** The E2E server's operator tokens (playwright.config.ts): plans, and /metrics. */
export const ADMIN_TOKEN = 'e2e-operator-token-0123456789abcdef';
export const METRICS_TOKEN = 'e2e-metrics-token-0123456789abcdef';

/** A page that records every script error, console error and failed API call. */
export async function newPerson(
  context: BrowserContext,
): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/v1/'))
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { page, errors };
}

/** Text that is on screen (tabs stay mounted, so hidden copies exist on phones). */
export const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/**
 * Signs up and finishes onboarding through the API, sharing the context's cookies, for tests
 * about what comes after sign-up (the sign-up screens have their own test).
 */
export async function apiSignUp(context: BrowserContext, displayName: string, handle: string) {
  const res = await context.request.post('/v1/auth/signup', {
    headers: CLIENT,
    data: {
      email: `${handle}@example.com`,
      password: PASSWORD,
      displayName,
      handle,
      birthYear: 1990,
      timeZone: 'UTC',
      client: 'web',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const { user } = (await res.json()) as { user: { id: string; handle: string } };
  const done = await context.request.patch('/v1/me', {
    headers: CLIENT,
    data: { onboarded: true },
  });
  expect(done.ok(), await done.text()).toBe(true);
  return user;
}
