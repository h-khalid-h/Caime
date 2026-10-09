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
      // The Arabic face (R73) is the one paired with Inter, declared under its name and fetched
      // only now that Arabic is drawn; the interface's Latin words sit at the layout's start, the
      // right ("English" in the languages list), as the Arabic ones do.
      await expect
        .poll(() => page.evaluate(() => document.fonts.check('16px Inter', 'عربي')))
        .toBe(true);
      const english = page.getByRole('radio', { name: 'English' });
      const gap = await english.evaluate((el) => {
        const text = [...el.querySelectorAll('*')].find(
          (n) => n.childNodes.length === 1 && n.textContent === 'English',
        );
        if (!text) throw new Error('no label');
        const range = document.createRange();
        range.selectNodeContents(text);
        return el.getBoundingClientRect().right - range.getBoundingClientRect().right;
      });
      expect(gap).toBeGreaterThan(8);
      expect(gap).toBeLessThan(28);
      // A brand moment (the desktop welcome's heading) draws Nunito's Arabic, the paired rounded
      // face: the face declared under Nunito's name for Arabic letters is fetched once it's drawn.
      const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const welcome = await visitor.newPage();
      await welcome.goto('/welcome?lang=ar');
      await expect(welcome.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(welcome.locator('#root').getByText('أهلًا بك في Caime')).toBeVisible();
      await expect
        .poll(() =>
          welcome.evaluate(() =>
            [...document.fonts].some(
              (f) =>
                f.family === 'Nunito' &&
                f.unicodeRange.startsWith('U+600') &&
                f.status === 'loaded',
            ),
          ),
        )
        .toBe(true);
      await visitor.close();
      // Every chevron and back arrow points the other way: mirrored, not moved.
      await page.goto('/you');
      await expect(visible(page, 'اللغة والمنطقة')).toBeVisible();
      const mirrored = await page.evaluate(() =>
        [...document.querySelectorAll('svg')]
          .filter((svg) => {
            let el: Element | null = svg;
            // The mirror is on the icon or a box right around it.
            for (let i = 0; i < 2 && el; i++, el = el.parentElement)
              if (getComputedStyle(el).transform === 'matrix(-1, 0, 0, 1, 0, 0)') return true;
            return false;
          })
          .map((svg) => {
            const box = svg.getBoundingClientRect();
            const drawn = svg.querySelector('path,polyline,line')?.getBoundingClientRect();
            // Still drawn inside its own viewport: a transform applied twice flipped it out once.
            return drawn ? drawn.left >= box.left - 1 && drawn.right <= box.right + 1 : false;
          }),
      );
      expect(mirrored.length).toBeGreaterThan(3);
      expect(mirrored.every(Boolean)).toBe(true);
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
        // The pointer rests where it last clicked, which hovers whatever is there now.
        await page.mouse.move(0, 0);
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
