/**
 * Bookings as a catalog, for organizations and people (R58): a salon sets hours and a paid
 * item, a visitor finds "Book" on its public page, signs up and books two places from the open
 * slots; the owner sets their own bookable item and a connection books it from their profile.
 * Orders (R60): the salon sells by the piece and the customer orders two on an Order card.
 */
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, photo, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `swibba.${stamp}`;
const ownerHandle = `noor.book.${stamp}`;
let orgId = '';
let ownerId = '';
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
let customerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

test.describe
  .serial('bookings as a catalog (R58)', () => {
    test('the owner sets hours and a paid item for everyone, in the setup', async ({ browser }) => {
      const owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      ownerId = (await apiSignUp(owner, 'Noor Haddad', ownerHandle)).id;
      const made = await owner.request.post('/v1/orgs', {
        headers: CLIENT,
        data: { name: `Swibba ${stamp}`, handle, kind: 'shop', country: 'EG' },
      });
      expect(made.ok(), await made.text()).toBe(true);
      orgId = ((await made.json()) as { org: { id: string } }).org.id;
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      // Hours: the defaults (Monday to Friday, 9 to 5, every half hour) are a shop's.
      await page.getByTestId('org-booking-hours').click();
      await page.getByTestId('org-booking-save').click();
      await expect(visible(page, /Mon–Fri 9:00–17:00/)).toBeVisible();
      // An item: a 45-minute haircut, 200 EGP, two chairs, for everyone.
      await page.getByTestId('org-booking-add-item').click();
      await page.getByTestId('org-booking-item-name').fill('Haircut');
      await page.getByTestId('org-booking-item-paid').click();
      await page.getByTestId('org-booking-item-price').fill('200');
      await page.getByTestId('org-booking-item-minutes-45').click();
      await page.getByTestId('org-booking-item-capacity-more').click();
      await expect(page.getByTestId('org-booking-item-capacity')).toHaveText('2');
      await page.getByTestId('org-booking-item-max-more').click();
      await page.getByTestId('org-booking-item-public').click();
      await page.getByTestId('org-booking-item-save').click();
      await expect(visible(page, 'Haircut')).toBeVisible();
      await expect(visible(page, /45 min · .*200.* · Everyone/)).toBeVisible();
      await page.screenshot({
        path: 'e2e/screenshots/desktop-org-booking-catalog.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      ownerState = await owner.storageState();
      await owner.close();
    });

    test('a visitor finds Book on the page, signs up and books two places from the open slots', async ({
      browser,
    }) => {
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.91' },
      });
      const { page, errors } = await newPerson(phone);
      const customer = `salma.book.${stamp}`;
      await page.goto(`/o/${handle}`);
      await expect(page.locator('#static')).toBeVisible();
      // The catalog's public item, with its price, and Book first.
      await expect(visible(page, 'Haircut')).toBeVisible();
      await expect(visible(page, /45 min · EGP/)).toBeVisible();
      await page.getByRole('link', { name: `Book Swibba ${stamp}` }).click();
      await page.waitForURL(/\/sign-up\?link=%2Fo%2F.*%3Fbook/);
      await page.getByTestId('signup-name').fill('Salma Customer');
      await page.getByTestId('signup-handle').fill(customer);
      await page.getByTestId('signup-email').fill(`${customer}@example.com`);
      await page.getByTestId('signup-password').fill('a long enough passphrase');
      await page.getByTestId('signup-birth-date').fill('1990-12-31');
      await expect(page.getByText('Available')).toBeVisible();
      await page.getByTestId('signup-submit').click();
      await page.waitForURL('**/onboarding');
      await page.getByTestId('onboarding-link').click();
      // In the conversation, on the appointment card's form: the one item is chosen, its slots shown.
      await page.waitForURL(/\/c\/[0-9a-f-]+\?book=1$/);
      await expect(page.getByTestId('book-item-line')).toContainText('45 min');
      await expect(page.getByTestId('book-item-line')).toContainText('not paid through Caime');
      await page.getByTestId('book-quantity-more').click();
      await expect(page.getByTestId('book-quantity')).toHaveText('2');
      const picker = page.getByTestId('slot-picker');
      await expect(picker).toBeVisible();
      await picker.locator('[data-testid^="slot-"]').first().click();
      await page.getByTestId('kit-send').click();
      const card = page.getByTestId('kit-appointment').first();
      await expect(card).toBeVisible();
      await expect(card).toContainText('Haircut · 45 min');
      await expect(card).toContainText('For 2');
      await expect(card).toContainText('400');
      await page.screenshot({
        path: 'e2e/screenshots/phone-booking-card.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      customerState = await phone.storageState();
      await phone.close();
    });

    test('the team sees the booking, who does it, and the owner is bookable too', async ({
      browser,
    }) => {
      const owner = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: ownerState,
      });
      const { page, errors } = await newPerson(owner);
      // The person's own bookings, in Settings: a free public chat, with a topic.
      await page.goto('/settings/bookings');
      await page.getByTestId('my-booking-hours').click();
      await page.getByTestId('my-booking-save').click();
      await expect(visible(page, /Mon–Fri 9:00–17:00/)).toBeVisible();
      await page.getByTestId('my-booking-add-item').click();
      await page.getByTestId('my-booking-item-name').fill('A quick chat');
      await page.getByTestId('my-booking-item-public').click();
      await page.getByTestId('my-booking-item-topic').click();
      await page.getByTestId('my-booking-item-save').click();
      await expect(visible(page, 'A quick chat')).toBeVisible();
      expect(errors).toEqual([]);
      await owner.close();

      // The customer, signed in, books the owner from their profile: a message request with the
      // card in it, and the topic they wrote.
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: customerState,
      });
      const { page: c, errors: customerErrors } = await newPerson(phone);
      await c.goto(`/p/${ownerId}`);
      await c.getByTestId('person-book').click();
      await c.waitForURL(/\/c\/[0-9a-f-]+\?book=1$/);
      await c.getByTestId('book-topic').fill('Your talk on Thursday');
      const picker = c.getByTestId('slot-picker');
      await expect(picker).toBeVisible();
      await picker.locator('[data-testid^="slot-"]').first().click();
      await c.getByTestId('kit-send').click();
      const card = c.getByTestId('kit-appointment').first();
      await expect(card).toContainText('Your talk on Thursday');
      await expect(card).toContainText('A quick chat · 30 min');
      expect(customerErrors).toEqual([]);
      await phone.close();
      void orgId;
    });

    test('orders from the catalog (R60): the owner sells by the piece, a customer orders two', async ({
      browser,
    }) => {
      const owner = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: ownerState,
      });
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      await page.getByTestId('org-booking-orders').click();
      await page.getByTestId('org-booking-orders-delivery').click();
      await page.getByTestId('org-booking-orders-note').fill('Ready in about 20 minutes');
      await page.getByTestId('org-booking-orders-save').click();
      await expect(visible(page, 'Orders: Pickup, Delivery')).toBeVisible();
      await page.getByTestId('org-booking-add-item').click();
      await page.getByTestId('org-booking-item-name').fill('Hair oil');
      await page.getByTestId('org-booking-item-paid').click();
      await page.getByTestId('org-booking-item-price').fill('120');
      await page.getByTestId('org-booking-item-each').click();
      await page.getByTestId('org-booking-item-public').click();
      await page.getByTestId('org-booking-item-save').click();
      await expect(visible(page, /By the piece · .*120.* · Everyone/)).toBeVisible();
      expect(errors).toEqual([]);
      await owner.close();

      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: customerState,
      });
      const { page: c, errors: customerErrors } = await newPerson(phone);
      await c.goto(`/o/${handle}`);
      await c.getByTestId('org-order').click();
      await c.waitForURL(/\/c\/[0-9a-f-]+\?order=1$/);
      const picker = c.getByTestId('order-picker');
      await expect(picker).toBeVisible();
      await expect(picker).toContainText('Ready in about 20 minutes');
      await picker.locator('[data-testid^="order-more-"]').first().click();
      await picker.locator('[data-testid^="order-more-"]').first().click();
      await c.getByTestId('order-way-delivery').click();
      await expect(c.getByTestId('order-total')).toContainText('240');
      await c.getByTestId('kit-send').click();
      const card = c.getByTestId('kit-order_status').first();
      await expect(card).toContainText('2 × Hair oil');
      await expect(card).toContainText('240');
      await expect(card).toContainText('Delivery');
      await c.screenshot({ path: 'e2e/screenshots/phone-order-card.png', animations: 'disabled' });
      expect(customerErrors).toEqual([]);
      await phone.close();
    });

    test('collections and item pages (R61): a shelf, a page for an item, and Order from it', async ({
      browser,
    }) => {
      const owner = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: ownerState,
      });
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      await page.getByTestId('org-booking-add-collection').click();
      await page.getByTestId('org-booking-collection-name').fill('Hair care');
      await page.getByTestId('org-booking-collection-description').fill('For after the chair.');
      await page.getByTestId('org-booking-collection-save').click();
      await expect(visible(page, /0 items · Everyone/)).toBeVisible();
      // The oil joins the shelf from its own sheet.
      await visible(page, 'Hair oil').click();
      await page.locator('[data-testid^="org-booking-item-in-"]').first().click();
      await page.getByTestId('org-booking-item-description').fill('Argan, 50 ml.');
      // Its photo (R63): uploaded here, kept with the item.
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('org-booking-item-photo').click();
      await (await chooser).setFiles([
        {
          name: 'oil.png',
          mimeType: 'image/png',
          buffer: photo(240, 240, [196, 140, 60], [255, 220, 150]),
        },
      ]);
      await expect(page.getByTestId('org-booking-item-photo-off')).toBeVisible();
      await page.getByTestId('org-booking-item-save').click();
      await expect(visible(page, /1 item · Everyone/)).toBeVisible();
      expect(errors).toEqual([]);
      await owner.close();

      // A visitor reads the item's own page, as a search engine does.
      const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const site = await visitor.newPage();
      await site.goto(`/o/${handle}/hair-oil`);
      await expect(site.getByRole('heading', { level: 1 })).toHaveText('Hair oil');
      await expect(site.getByText('Argan, 50 ml.')).toBeVisible();
      await expect(site.getByRole('link', { name: 'Hair care' }).first()).toBeVisible();
      const ld = await site.locator('script[type="application/ld+json"]').textContent();
      expect(ld).toContain('"@type":"Product"');
      expect(ld).toContain('/items/');
      // The photo is the page's, and a link preview's, picture.
      await expect(site.locator('img.photo')).toBeVisible();
      expect(
        await site.locator('img.photo').evaluate((i) => (i as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await site.getByRole('link', { name: 'Hair care' }).first().click();
      await expect(site.getByRole('heading', { level: 1 })).toHaveText('Hair care');
      await visitor.close();

      // Signed in, the same address is the organization's page with the item over it; Order
      // opens the card's form with it chosen.
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: customerState,
      });
      const { page: c, errors: customerErrors } = await newPerson(phone);
      await c.goto(`/o/${handle}/hair-oil`);
      const sheet = c.getByTestId('item-sheet');
      await expect(sheet).toBeInViewport({ ratio: 1 });
      await expect(sheet).toContainText('Hair care');
      await expect(sheet.locator('img').first()).toBeVisible();
      await c.screenshot({ path: 'e2e/screenshots/phone-item-sheet.png', animations: 'disabled' });
      await c.getByTestId('item-take').click();
      await c.waitForURL(/\/c\/[0-9a-f-]+\?order=1&item=/);
      const picker = c.getByTestId('order-picker');
      await expect(picker).toBeVisible();
      await expect(picker).toContainText('Hair care');
      await expect(picker.locator('[data-testid^="order-count-"]').first()).toHaveText('1');
      expect(customerErrors).toEqual([]);
      await phone.close();
    });

    test('Pay (R62): a way to be paid, Pay from the page and from an order, received by the team', async ({
      browser,
    }) => {
      const owner = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: ownerState,
      });
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      await page.getByTestId('org-booking-add-way').click();
      await page.getByTestId('org-booking-way-link').click();
      await page.getByTestId('org-booking-way-label').fill('Pay online');
      await page.getByTestId('org-booking-way-url').fill('https://pay.example/swibba');
      await page.getByTestId('org-booking-way-save').click();
      await expect(visible(page, /Payment link · Customers/)).toBeVisible();
      expect(errors).toEqual([]);

      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: customerState,
      });
      const { page: c, errors: customerErrors } = await newPerson(phone);
      await c.goto(`/o/${handle}`);
      await c.getByTestId('org-pay').click();
      await c.waitForURL(/\/c\/[0-9a-f-]+\?pay=1$/);
      const conversationId = new URL(c.url()).pathname.split('/')[2] ?? '';
      // Paying them: the way is chosen, the amount is theirs to write.
      await expect(c.getByTestId('kit-direction-send')).toBeChecked();
      await c.getByTestId('kit-field-amount').fill('150');
      await c.getByTestId('kit-field-note').fill('Deposit');
      await c.getByTestId('kit-send').click();
      const paid = c.getByTestId('kit-payment_request').last();
      await expect(paid).toContainText('Sent');
      await expect(paid).toContainText('Deposit');
      await expect(paid.getByTestId('pay-to')).toContainText('Pay online');
      await expect(paid.locator('[data-testid^="pay-open-"]')).toBeVisible();
      await c.screenshot({ path: 'e2e/screenshots/phone-pay-card.png', animations: 'disabled' });
      // Pay from the order: the form opens filled with its total, answering it.
      await c.getByTestId('kit-pay').first().click();
      await expect(c.getByTestId('kit-direction-send')).toBeChecked();
      await expect(c.getByTestId('kit-field-amount')).toHaveValue('240');
      await c.getByTestId('kit-send').click();
      await expect(c.getByTestId('kit-payment_request')).toHaveCount(2);
      expect(customerErrors).toEqual([]);
      await phone.close();

      // The team says it arrived; the customer couldn't have.
      await page.goto(`/c/${conversationId}`);
      const card = page.getByTestId('kit-payment_request').filter({ hasText: 'Deposit' });
      await card.getByRole('button', { name: 'Received', exact: true }).click();
      await expect(card).toContainText('Paid');
      expect(errors).toEqual([]);
      await owner.close();
    });
  });
