/**
 * Caime in French (R55): the third language follows the same path as Arabic, left to right:
 * chosen in Language and region, the app remounts in French at once, the choice is the
 * account's, and the public site reads in French from its own switch.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('the interface follows the language chosen, and the site has a French switch', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await apiSignUp(phone, 'Noor French', `noor.fr.${suffix}`);
  const { page, errors } = await newPerson(phone);
  await page.goto('/settings/region');
  await expect(visible(page, 'Language and region')).toBeVisible();
  await page.getByRole('radio', { name: 'Français' }).click();
  // The app remounts in French, still left to right, without a reload.
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(visible(page, 'Langue et région')).toBeVisible();
  await expect
    .poll(async () => (await page.request.get('/v1/me').then((r) => r.json())).user.preferences)
    .toMatchObject({ language: 'fr' });
  await page.goto('/chats');
  await expect(visible(page, 'Discussions')).toBeVisible();
  await expect(visible(page, 'Dites bonjour à quelqu’un')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phone-french-chats.png', animations: 'disabled' });
  // A reload keeps it: the choice is on the device and on the account.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(visible(page, 'Discussions')).toBeVisible();
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  await page.close();

  // The public site, for a visitor: the French switch, and the page in French with its
  // alternates for the other two languages.
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const site = await visitor.newPage();
  await site.goto('/business');
  await site.getByRole('link', { name: 'Français' }).click();
  await expect(site).toHaveURL(/lang=fr/);
  await expect(site.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(site.getByRole('heading', { level: 1 })).toContainText(
    'Répondez au nom de l’organisation',
  );
  const alternates = await site
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('hreflang')));
  expect(alternates).toEqual(expect.arrayContaining(['en', 'ar', 'fr']));
  await visitor.close();
});
