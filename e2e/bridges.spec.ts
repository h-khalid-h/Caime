/**
 * R79, layer 1: a bridge (Zapier here) connects in Caime with a token made for the platform,
 * scoped to what was ticked, shown once, listed under Connected as the platform and stopped
 * there; a contacts file read on the device says who's already here and gives one invite link
 * for the rest; and the API document is served to anyone.
 */
import { type BrowserContext, expect, type Page, request, test } from '@playwright/test';
import { apiSignUp, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test.describe
  .serial('bridges, a contacts file and the API document (R79)', () => {
    let desktop: BrowserContext;
    let other: BrowserContext;
    let page: Page;
    let errors: string[];
    let noor: { id: string; handle: string };
    let sara: { id: string; handle: string };

    test.beforeAll(async ({ browser }) => {
      desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      other = await browser.newContext();
      noor = await apiSignUp(desktop, 'Noor Bridge', `noor.bridge.${suffix}`);
      // An adult, findable by address unless they turn it off: the file finds her.
      sara = await apiSignUp(other, 'Sara Bridge', `sara.bridge.${suffix}`);
      ({ page, errors } = await newPerson(desktop));
    });

    test.afterAll(async () => {
      await desktop.close();
      await other.close();
    });

    test('a bridge connects in Caime: a token for the platform, shown once, used, listed, stopped', async () => {
      await page.goto('/settings/apps?tab=discover');
      await page.getByTestId('discover-category-automation').click();
      const row = page.getByTestId('discover-zapier');
      await expect(row).toContainText('Connect Caime to the apps on Zapier');
      await row.click();
      const sheet = page.getByTestId('bridge-sheet');
      await expect(sheet).toBeVisible();
      await expect(visible(page, 'What Zapier can do with Caime')).toBeVisible();
      // Reading by default; the recipe will finish actions too.
      await page.getByTestId('bridge-scope-actions:write').click();
      await page.getByTestId('bridge-connect').click();
      const shown = (
        await page.getByTestId('bridge-token').filter({ visible: true }).innerText()
      ).match(/cap_[\w-]+/)?.[0];
      expect(shown).toBeTruthy();
      const token = shown as string;
      await expect(visible(page, /Shown this once: paste it on Zapier now/)).toBeVisible();
      await expect(page.getByTestId('bridge-open')).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/desktop-bridge-zapier.png' });
      // What the platform does with it: a bearer on the person's routes, within what was ticked.
      const api = await request.newContext({
        baseURL: test.info().project.use.baseURL,
        extraHTTPHeaders: { authorization: `Bearer ${token}` },
      });
      const me = await api.get('/v1/me');
      expect(me.status()).toBe(200);
      expect((await me.json()).user.handle).toBe(noor.handle);
      expect((await api.get('/v1/tasks')).status()).toBe(200);
      const made = await api.post('/v1/tasks', {
        data: { title: `From Zapier ${suffix}`, clientId: `zap-${suffix}` },
      });
      expect(made.status()).toBe(201);
      // Reading was ticked by default, writing a message wasn't; the account's own routes never.
      expect((await api.get('/v1/inbox')).status()).toBe(200);
      const unticked = await api.post(
        '/v1/conversations/00000000-0000-0000-0000-000000000000/messages',
        { data: { clientId: `zap-msg-${suffix}`, body: 'Not allowed' } },
      );
      expect(unticked.status()).toBe(403);
      expect((await unticked.json()).error.code).toBe('token_scope');
      const own = await api.get('/v1/me/tokens');
      expect(own.status()).toBe(403);
      expect((await own.json()).error.code).toBe('token_route');
      await page.keyboard.press('Escape');
      // Discover says it's on; Connected lists it as the platform, with when it was last used.
      await expect(row).toContainText('Connected');
      await page.goto('/settings/apps');
      const connected = page.getByTestId('connected-Zapier');
      await expect(connected).toContainText(/On since .* · last used/);
      await connected.click();
      await expect(page.getByTestId('bridge-on').filter({ visible: true })).toBeVisible();
      await expect(page.getByTestId('bridge-scopes').filter({ visible: true })).toContainText(
        'Add, change and finish your actions',
      );
      // The action it added says what sent it.
      await page.goto('/actions');
      await expect(visible(page, `From Zapier ${suffix}`)).toBeVisible();
      await page.goto('/settings/apps');
      await page.getByTestId('connected-Zapier').click();
      await page.getByTestId('bridge-stop').filter({ visible: true }).click();
      await page.getByTestId('bridge-confirm').filter({ visible: true }).click();
      await expect(visible(page, 'Zapier can’t act for you any more')).toBeVisible();
      expect((await api.get('/v1/me')).status()).toBe(401);
      await api.dispose();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('connected-Zapier')).toHaveCount(0);
    });

    test('a contacts file says who’s already here and gives a link for the rest, keeping nothing', async () => {
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Bridge;Sara;;;',
        'FN:Sara Bridge',
        `EMAIL;type=INTERNET;type=pref:Sara.Bridge.${suffix}@Example.com`,
        'END:VCARD',
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Nobody Yet',
        `EMAIL:nobody.${suffix}@example.com`,
        'END:VCARD',
      ].join('\r\n');
      await page.goto('/connect');
      await page.getByTestId('connect-contacts').click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('contacts-source-file').click();
      await (await chooser).setFiles({
        name: 'contacts.vcf',
        mimeType: 'text/vcard',
        buffer: Buffer.from(vcard),
      });
      // Read and looked up at once: nothing more to tap between the file and who's here.
      await expect(page.getByTestId('contacts-summary')).toContainText('contacts.vcf');
      await expect(page.getByTestId('contacts-summary')).toContainText('2 contacts');
      await expect(page.getByTestId('contacts-found')).toHaveText('1 person is on Caime');
      const match = page.getByTestId(`contacts-match-${sara.handle}`);
      await expect(match).toContainText('Sara Bridge');
      await page.getByTestId(`contacts-connect-${sara.handle}`).click();
      await expect(visible(page, 'Request sent to Sara')).toBeVisible();
      await expect(match).toContainText('Requested');
      await expect(page.getByTestId('contacts-rest')).toHaveText('1 isn’t on Caime yet');
      // Whoever has only an address is invited by mail, from the person's own.
      await expect(page.getByTestId('contacts-invite-row-0')).toContainText(
        `nobody.${suffix}@example.com`,
      );
      await expect(page.getByTestId('contacts-invite-0-email')).toBeVisible();
      await expect(page.getByTestId('contacts-invite-0-whatsapp')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-contacts-file.png' });
      await page.getByTestId('contacts-done').click();
      // Sara has the request; the file's other address was never anyone's business.
      const hers = await other.request.get('/v1/connections/requests?direction=incoming');
      expect(hers.ok()).toBe(true);
      const requests = (await hers.json()).requests as Array<{ person: { id: string } }>;
      expect(requests.map((r) => r.person.id)).toContain(noor.id);
    });

    test('the API document is served to anyone, from the schemas the routes parse with', async () => {
      const res = await desktop.request.get('/v1/openapi.json');
      expect(res.status()).toBe(200);
      const doc = await res.json();
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.paths['/v1/tasks'].get.security).toEqual([{ personalToken: ['actions:read'] }]);
      expect(doc.paths['/v1/orgs/{id}/inbox'].get.security).toEqual([{ appToken: ['inbox:read'] }]);
      expect(errors).toEqual([]);
    });
  });
