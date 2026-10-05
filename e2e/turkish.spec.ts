/**
 * Caime in Turkish (R59): the fourth language follows French's path, left to right: chosen in
 * Language and region, the app remounts in Turkish at once, the choice is the account's, and
 * the public site reads in Turkish from its own switch.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('the interface follows Turkish when chosen, and the site has a Turkish switch', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await apiSignUp(phone, 'Noor Turkish', `noor.tr.${suffix}`);
  const { page, errors } = await newPerson(phone);
  await page.goto('/settings/region');
  await expect(visible(page, 'Language and region')).toBeVisible();
  await page.getByRole('radio', { name: 'Türkçe' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(visible(page, 'Dil ve bölge')).toBeVisible();
  await expect
    .poll(async () => (await page.request.get('/v1/me').then((r) => r.json())).user.preferences)
    .toMatchObject({ language: 'tr' });
  await page.goto('/chats');
  await expect(visible(page, 'Sohbetler')).toBeVisible();
  await expect(visible(page, 'Birine merhaba deyin')).toBeVisible();
  await page.screenshot({
    path: 'e2e/screenshots/phone-turkish-chats.png',
    animations: 'disabled',
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(visible(page, 'Sohbetler')).toBeVisible();
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  await page.close();

  const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const site = await visitor.newPage();
  await site.goto('/business');
  await site.getByRole('link', { name: 'Türkçe' }).click();
  await expect(site).toHaveURL(/lang=tr/);
  await expect(site.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(site.getByRole('heading', { level: 1 })).toContainText('Kuruluş adına yanıt verin');
  const alternates = await site
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('hreflang')));
  expect(alternates).toEqual(expect.arrayContaining(['en', 'ar', 'fr', 'tr']));
  await visitor.close();
});
