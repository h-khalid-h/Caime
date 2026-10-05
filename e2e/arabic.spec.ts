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
      await page.goto('/chats');
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

    test('a tour of the screens in Arabic, photographed: a conversation, People, a person, an organization, Appearance', async ({
      browser,
    }) => {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const noor = await apiSignUp(phone, 'Noor Tour', `noor.tour.${suffix}`);
      await apiSignUp(other, 'Tariq Hassan', `tariq.tour.${suffix}`);
      const asked = await other.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: noor.id },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      const accepted = await phone.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      const convo = ((await accepted.json()) as { conversationId: string }).conversationId;
      for (const body of [
        'Hi Noor! Can we meet on Thursday at 10?',
        'I will send the contract tomorrow.',
      ]) {
        const sent = await other.request.post(`/v1/conversations/${convo}/messages`, {
          headers: CLIENT,
          data: { clientId: crypto.randomUUID(), kind: 'text', body },
        });
        expect(sent.ok(), await sent.text()).toBe(true);
      }
      const org = await phone.request.post('/v1/orgs', {
        headers: CLIENT,
        data: { country: 'EG', name: 'Nile Dental', handle: `nile.tour.${suffix}`, kind: 'clinic' },
      });
      expect(org.ok(), await org.text()).toBe(true);
      const { page, errors } = await newPerson(phone);
      await page.goto('/settings/region');
      await page.getByRole('radio', { name: 'العربية' }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const shot = async (path: string, name: string, settled: string) => {
        await page.goto(path);
        await expect(visible(page, settled)).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: `e2e/screenshots/phone-arabic-${name}.png`,
          animations: 'disabled',
        });
      };
      // The inbox's line, the row's time and the day heading are Caime's words, in Arabic.
      await shot('/', 'attention', 'أمر واحد يحتاج إليك.');
      await shot('/chats', 'inbox', 'واحدة تحتاجك');
      await expect(visible(page, 'الآن')).toBeVisible();
      await shot(`/c/${convo}`, 'conversation', 'اليوم');
      await shot('/people', 'people', 'غير مصنَّف 1');
      // A person's facts: counts in Arabic plural forms, "@handle" in its order.
      await shot(`/@tariq.tour.${suffix}`, 'person', 'رسالتان · نادرًا · آخرها الآن');
      await expect(visible(page, 'لا ملفات · لا روابط')).toBeVisible();
      await expect(visible(page, `@tariq.tour.${suffix}`)).toBeVisible();
      await shot(`/o/nile.tour.${suffix}`, 'org', 'عيادة أو مركز');
      await expect(visible(page, 'المعرّف')).toBeVisible();
      await shot('/settings/appearance', 'appearance', 'برقوقي');
      expect(errors).toEqual([]);
      await other.close();
      await phone.close();
    });
  });
