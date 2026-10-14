/**
 * From your contacts (R89): wherever someone keeps their people, one sheet reads them on the
 * device and says who's here and who to invite. A Google account on a desktop, read by the
 * browser itself after a consent the server never keeps; the browser's own contact picker on a
 * phone, opened the way onboarding opens it; an Outlook account of a thousand people, read page
 * by page. Each time only addresses reach Caime, and invitations go from the person's own apps.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { ACCOUNTS_STUB, apiSignUp, newPerson } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

async function holds(people: unknown) {
  const res = await fetch(`${ACCOUNTS_STUB}/people`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(people),
  });
  expect(res.ok).toBe(true);
}

test.describe
  .serial('from your contacts (R89)', () => {
    let desktop: BrowserContext;
    let phone: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let sara: { id: string; handle: string };
    let omar: { id: string; handle: string };
    let other: BrowserContext;
    let third: BrowserContext;

    test.beforeAll(async ({ browser }) => {
      desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      other = await browser.newContext();
      await apiSignUp(desktop, 'Noor Contacts', `noor.contacts.${suffix}`);
      sara = await apiSignUp(other, 'Sara Contacts', `sara.contacts.${suffix}`);
      third = await browser.newContext();
      omar = await apiSignUp(third, 'Omar Contacts', `omar.contacts.${suffix}`);
      noor = await newPerson(desktop);
      // WhatsApp opens in a tab of its own; here it opens nothing out there.
      await desktop.route('https://wa.me/**', (r) =>
        r.fulfill({ body: 'WhatsApp', contentType: 'text/plain' }),
      );
    });

    test.afterAll(async () => {
      await desktop.close();
      await other.close();
      await third.close();
      await phone?.close();
    });

    test('a Google account is read once by the browser: who’s here, all asked at once, the rest invited', async () => {
      await holds({
        google: {
          connections: [
            {
              names: [{ displayName: 'Sara C.' }],
              emailAddresses: [{ value: `${sara.handle}@example.com` }],
            },
            {
              names: [{ displayName: 'Omar C.' }],
              emailAddresses: [{ value: `${omar.handle.toUpperCase()}@Example.com` }],
            },
            {
              names: [{ displayName: 'Lina Fares' }],
              phoneNumbers: [{ value: '010 0123 4567' }],
            },
          ],
          // Someone written to, the other list: Karim, and Sara again by her address.
          otherContacts: [
            {
              names: [{ displayName: 'Karim Nabil' }],
              emailAddresses: [{ value: `karim.${suffix}@example.com` }],
            },
            { emailAddresses: [{ value: `${sara.handle}@example.com` }] },
          ],
        },
      });
      const { page } = noor;
      await page.goto('/connect');
      await page.getByTestId('connect-contacts').click();
      await expect(page.getByTestId('contacts-source-microsoft')).toContainText('Outlook');
      await page.getByTestId('contacts-source-google').click();
      // Away to the consent and back to the sheet, the access read from the address and gone.
      await expect(page.getByTestId('contacts-found')).toContainText('2 people are on Caime');
      expect(page.url()).not.toContain('sealed');
      await expect(page.getByTestId('contacts-summary')).toContainText('Google');
      await expect(page.getByTestId('contacts-summary')).toContainText('4 contacts');
      await page.getByTestId('contacts-connect-all').click();
      await expect(page.getByTestId(`contacts-match-${sara.handle}`)).toContainText('Requested');
      await expect(page.getByTestId(`contacts-match-${omar.handle}`)).toContainText('Requested');
      await expect(page.getByTestId('contacts-connect-all')).toHaveCount(0);

      // The rest, by name: Karim by mail, Lina by WhatsApp (no texts from a desktop).
      await expect(page.getByTestId('contacts-rest')).toHaveText('2 aren’t on Caime yet');
      await expect(page.getByTestId('contacts-invite-row-0')).toContainText('Karim Nabil');
      await expect(page.getByTestId('contacts-invite-0-email')).toBeVisible();
      await expect(page.getByTestId('contacts-invite-row-1')).toContainText('Lina Fares');
      await expect(page.getByTestId('contacts-invite-row-1')).toContainText('+201001234567');
      await expect(page.getByTestId('contacts-invite-1-sms')).toHaveCount(0);
      const opened = desktop.waitForEvent('page');
      await page.getByTestId('contacts-invite-1-whatsapp').click();
      const wa = new URL((await opened).url());
      // Her Egyptian number as dialled from anywhere, with the words and Noor's own link.
      expect(wa.pathname).toBe('/201001234567');
      expect(wa.searchParams.get('text')).toMatch(
        /^Hi Lina, I’m on Caime\. Join me there: .*\/i\//,
      );
      await expect(page.getByTestId('contacts-invite-row-1')).toContainText('Invited');
      await page.screenshot({ path: 'e2e/screenshots/desktop-contacts-google.png' });

      // The access reached the browser alone: every read carried it from a page, and Caime's
      // server only traded the code for it.
      const { requests } = (await (await fetch(`${ACCOUNTS_STUB}/requests`)).json()) as {
        requests: Array<{ method: string; path: string; browser: boolean; access: string | null }>;
      };
      const reads = requests.filter((r) => r.path.startsWith('/v1/') && r.method === 'GET');
      expect(reads.map((r) => r.path).sort()).toEqual([
        '/v1/otherContacts',
        '/v1/people/me/connections',
      ]);
      expect(reads.every((r) => r.browser && r.access === 'google-e2e-access')).toBe(true);
      expect(requests.find((r) => r.path === '/google/token')?.browser).toBe(false);

      // Sara has Noor's request.
      const hers = await other.request.get('/v1/connections/requests?direction=incoming');
      const asked = ((await hers.json()) as { requests: Array<{ person: { handle: string } }> })
        .requests;
      expect(asked.map((r) => r.person.handle)).toContain(`noor.contacts.${suffix}`);
      await page.getByTestId('contacts-done').click();
      expect(noor.errors).toEqual([]);
    });

    test('a phone’s browser chooses from its own contacts, opened as onboarding opens it, and texts the rest', async ({
      browser,
    }) => {
      phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      await phone.route('https://wa.me/**', (r) =>
        r.fulfill({ body: 'WhatsApp', contentType: 'text/plain' }),
      );
      // Chrome on Android's contact picker: the people chosen, as it gives them.
      await phone.addInitScript(
        (picked) => {
          Object.defineProperty(navigator, 'contacts', {
            configurable: true,
            value: {
              getProperties: async () => ['name', 'email', 'tel'],
              select: async () => picked,
            },
          });
        },
        [
          { name: ['Sara C.'], email: [`${sara.handle}@example.com`], tel: [] },
          { name: ['Rami Haddad'], email: [], tel: ['+961 3 123 456'] },
        ],
      );
      await apiSignUp(phone, 'Maya Contacts', `maya.contacts.${suffix}`);
      const maya = await newPerson(phone);
      const { page } = maya;
      await page.goto('/connect?contacts=1');
      await expect(page.getByTestId('contacts-source-device')).toContainText(
        'Choose from your contacts',
      );
      await page.screenshot({ path: 'e2e/screenshots/phone-contacts-sources.png' });
      await page.getByTestId('contacts-source-device').click();
      await expect(page.getByTestId('contacts-found')).toContainText('1 person is on Caime');
      await expect(page.getByTestId('contacts-connect-all')).toHaveCount(0);
      await expect(page.getByTestId('contacts-invite-row-0')).toContainText('Rami Haddad');
      await expect(page.getByTestId('contacts-invite-0-sms')).toBeVisible();
      const opened = phone.waitForEvent('page');
      await page.getByTestId('contacts-invite-0-whatsapp').click();
      expect(new URL((await opened).url()).pathname).toBe('/9613123456');
      await page.screenshot({ path: 'e2e/screenshots/phone-contacts.png' });
      expect(maya.errors).toEqual([]);
    });

    test('an Outlook account of a thousand people is read page by page, and the rest found by name', async () => {
      const many = Array.from({ length: 1001 }, (_, i) => ({
        displayName: `Person ${String(i).padStart(4, '0')}`,
        emailAddresses: [{ address: `person${i}.${suffix}@example.com` }],
      }));
      await holds({
        microsoft: {
          contacts: [
            ...many,
            { displayName: 'Omar C.', emailAddresses: [{ address: `${omar.handle}@example.com` }] },
          ],
          people: [],
        },
      });
      const { page } = noor;
      await page.goto('/connect');
      await page.getByTestId('connect-contacts').click();
      await page.getByTestId('contacts-source-microsoft').click();
      await expect(page.getByTestId('contacts-found')).toContainText('1 person is on Caime');
      await expect(page.getByTestId(`contacts-match-${omar.handle}`)).toContainText('Requested');
      await expect(page.getByTestId('contacts-rest')).toContainText('aren’t on Caime yet');
      await expect(page.getByTestId('contacts-invite-row-29')).toBeVisible();
      await expect(page.getByTestId('contacts-invite-row-30')).toHaveCount(0);
      await page.getByTestId('contacts-invite-search').fill('person 0999');
      await expect(page.getByTestId('contacts-invite-row-0')).toContainText('Person 0999');
      await expect(page.getByTestId('contacts-invite-row-1')).toHaveCount(0);
      const { requests } = (await (await fetch(`${ACCOUNTS_STUB}/requests`)).json()) as {
        requests: Array<{ path: string; browser: boolean }>;
      };
      // Two pages of contacts (999, then the rest) and the people the account knows.
      expect(requests.filter((r) => r.path === '/v1.0/me/contacts')).toHaveLength(2);
      expect(requests.filter((r) => r.path === '/v1.0/me/people')).toHaveLength(1);
      expect(noor.errors).toEqual([]);
    });
  });
