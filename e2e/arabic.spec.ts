/**
 * Caime in Arabic (R54): the interface follows the language chosen in Language and region,
 * right to left, at once and after a reload, and on every device of the account.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test.describe
  .serial('Caime in Arabic (R54)', () => {
    test('the interface follows the language chosen, right to left, on every device', async ({
      browser,
    }) => {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const noor = await apiSignUp(phone, 'Noor Arabic', `noor.ar.${suffix}`);
      const { page, errors } = await newPerson(phone);
      await page.goto('/settings/region');
      await expect(visible(page, 'Language and region')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await page.getByRole('radio', { name: 'العربية' }).click();
      // The app remounts in Arabic, right to left, without a reload.
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(visible(page, 'اللغة والمنطقة')).toBeVisible();
      // The choice is the account's too, so other devices follow.
      await expect
        .poll(async () => (await page.request.get('/v1/me').then((r) => r.json())).user.preferences)
        .toMatchObject({ language: 'ar' });
      await page.goto('/');
      await expect(visible(page, 'الدردشات')).toBeVisible();
      await expect(visible(page, 'ألقِ التحية على أحد')).toBeVisible();
      await page.screenshot({
        path: 'e2e/screenshots/phone-arabic-chats.png',
        animations: 'disabled',
      });
      // What the server writes to Noor is in Arabic too: someone else's request, from a device
      // that says nothing of a language, reaches her as “… wants to connect with you” in Arabic.
      const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(other, 'Tariq Hassan', `tariq.ar.${suffix}`);
      const asked = await other.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: noor.id },
      });
      expect(asked.ok(), await asked.text()).toBe(true);
      await expect
        .poll(async () => {
          const res = await page.request.get('/v1/notifications');
          const { notifications } = (await res.json()) as { notifications: { title: string }[] };
          return notifications.map((n) => n.title);
        })
        .toContain('يريد Tariq Hassan التواصل معك');
      await other.close();
      await page.goto('/settings/notifications');
      await expect(visible(page, 'الإشعارات والأولويات')).toBeVisible();
      await page.screenshot({
        path: 'e2e/screenshots/phone-arabic-notifications.png',
        animations: 'disabled',
      });
      // A reload keeps it.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(visible(page, 'الإشعارات والأولويات')).toBeVisible();

      // A desktop browser of the same account, whose device speaks English, follows the account.
      const desktop = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        storageState: await phone.storageState(),
      });
      const { page: d, errors: desktopErrors } = await newPerson(desktop);
      await d.goto('/settings/region');
      await expect(d.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(visible(d, 'اللغة والمنطقة')).toBeVisible();
      await d.screenshot({
        path: 'e2e/screenshots/desktop-arabic-region.png',
        animations: 'disabled',
      });
      // And back to English, from there.
      await d.getByRole('radio', { name: 'English' }).click();
      await expect(d.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(visible(d, 'Language and region')).toBeVisible();
      expect(errors).toEqual([]);
      expect(desktopErrors).toEqual([]);
      await desktop.close();
      await phone.close();
    });
  });
