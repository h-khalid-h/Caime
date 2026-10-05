/**
 * An organization's own door (R53): its page is the link a clinic puts on the door and the
 * receipt. Someone new who opens it signs up and lands in the conversation, as an invite's
 * guest does; the team sees the link and its QR code on the organization's page.
 */
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.door.${stamp}`;
let orgId = '';
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

test.describe
  .serial('the organization’s door (R53)', () => {
    test('the team sees the door: its link, a QR code, and what “Verified” will mean', async ({
      browser,
    }) => {
      const owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(owner, 'Noor Haddad', `noor.door.${stamp}`);
      const made = await owner.request.post('/v1/orgs', {
        headers: CLIENT,
        data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
      });
      expect(made.ok(), await made.text()).toBe(true);
      orgId = ((await made.json()) as { org: { id: string } }).org.id;
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      const door = page.getByTestId('org-door');
      await expect(door).toBeVisible();
      await expect(door.getByTestId('org-door-qr').locator('svg path')).toHaveAttribute(
        'd',
        /^M0 0h7v1h-7z/,
      );
      const origin = new URL(page.url()).origin;
      await expect(door.getByTestId('org-door-link')).toContainText(`${origin}/o/${handle}?write`);
      await expect(door).toContainText('Verify your domain below');
      // The door comes first, before hours and bookings (R53): a clinic's order.
      const doorBox = await door.boundingBox();
      const bookingBox = await page.getByTestId('org-booking-hours').boundingBox();
      expect(doorBox && bookingBox && doorBox.y < bookingBox.y).toBe(true);
      await page.screenshot({
        path: 'e2e/screenshots/desktop-org-door.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      ownerState = await owner.storageState();
      await owner.close();
    });

    test('a visitor who opens it lands in the conversation and writes, with nothing more to tap', async ({
      browser,
    }) => {
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.90' },
      });
      const { page, errors } = await newPerson(phone);
      const customer = `salma.door.${stamp}`;
      const started = Date.now();
      // The public page, without the app: who it is, and whether it's verified, before writing.
      await page.goto(`/o/${handle}`);
      await expect(page.locator('#static')).toBeVisible();
      await expect(visible(page, `Nile Dental ${stamp}`)).toBeVisible();
      await expect(visible(page, 'Not yet')).toBeVisible();
      expect(await page.locator('script[src]').count()).toBe(0);
      await page.getByRole('link', { name: `Message Nile Dental ${stamp} on Caime` }).click();
      await page.waitForURL(/\/sign-up\?link=%2Fo%2F/);
      await page.getByTestId('signup-name').fill('Salma Customer');
      await page.getByTestId('signup-handle').fill(customer);
      await page.getByTestId('signup-email').fill(`${customer}@example.com`);
      await page.getByTestId('signup-password').fill('a long enough passphrase');
      await page.getByTestId('signup-birth-date').fill('1990-12-31');
      await expect(page.getByText('Available')).toBeVisible();
      await page.getByTestId('signup-submit').click();
      await page.waitForURL('**/onboarding');
      // Came through the door: straight to the last step (R56).
      await expect(visible(page, `You came here to write to Nile Dental ${stamp}`)).toBeVisible();
      await page.getByTestId('onboarding-link').click();
      // Straight into the conversation: no page in between, no second tap.
      await page.waitForURL(/\/c\/[0-9a-f-]+$/);
      await page.getByTestId('composer-input').fill('Hello, do you have a slot this week?');
      await page.getByTestId('composer-send').click();
      await expect(visible(page, 'Hello, do you have a slot this week?')).toBeVisible();
      const doorToMessage = Date.now() - started;
      const measured = `${(doorToMessage / 1000).toFixed(1)} s from opening the door to the first message sent`;
      test.info().annotations.push({ type: 'door-to-message', description: measured });
      console.log(`door-to-message: ${measured}`);
      expect(doorToMessage).toBeLessThan(60_000);
      await page.screenshot({
        path: 'e2e/screenshots/phone-door-conversation.png',
        animations: 'disabled',
      });
      // Opening the door again, signed in, opens the same conversation.
      const url = page.url();
      await page.goto(`/o/${handle}?write`);
      await page.waitForURL(url);
      expect(errors).toEqual([]);
      await phone.close();
    });
  });

test('the team sets how long conversations are kept, exports them, and erases one at the customer’s request', async ({
  browser,
}) => {
  // A customer, through the API, with a message in: what the organization answers for.
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customer = await apiSignUp(customerContext, 'Kareem Customer', `kareem.door.${stamp}`);
  const started = await customerContext.request.post(`/v1/orgs/${orgId}/conversations`, {
    headers: CLIENT,
  });
  expect(started.ok(), await started.text()).toBe(true);
  const conversationId = ((await started.json()) as { conversationId: string }).conversationId;
  const sent = await customerContext.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: { clientId: crypto.randomUUID(), kind: 'text', body: 'Please delete my records.' },
  });
  expect(sent.ok(), await sent.text()).toBe(true);

  const owner = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: ownerState,
    acceptDownloads: true,
  });
  const { page, errors } = await newPerson(owner);
  await page.goto(`/o/${handle}/setup`);
  const data = page.getByTestId('org-data');
  await expect(data).toBeVisible();
  // Kept for 90 days: the owner's to set, and the customer reads it where they write.
  await data
    .getByTestId('org-retention')
    .getByRole('radio', { name: /^90 days/ })
    .click();
  await expect(visible(page, 'Conversations are kept for 90 days')).toBeVisible();
  const { page: c, errors: customerErrors } = await newPerson(customerContext);
  await c.goto(`/c/${conversationId}`);
  await expect(c.getByTestId('business-retention')).toContainText(
    `Nile Dental ${stamp} keeps this conversation for 90 days`,
  );
  // The export is a file: the organization's own.
  const download = page.waitForEvent('download');
  await data.getByTestId('org-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    new RegExp(`^${handle.replaceAll('.', '\\.')}-caime-\\d{4}-\\d{2}-\\d{2}\\.json$`),
  );
  const text = await (await file.createReadStream())
    .toArray()
    .then((parts) => Buffer.concat(parts).toString());
  const exported = JSON.parse(text) as {
    conversations: Array<{ messages: Array<{ body: string | null }> }>;
  };
  expect(exported.conversations.flatMap((x) => x.messages.map((m) => m.body))).toContain(
    'Please delete my records.',
  );
  // Erased at the customer's request, from the thread: the customer reads a line from the
  // organization, the team from whoever did it.
  await page.goto(`/c/${conversationId}`);
  await expect(visible(page, 'Please delete my records.')).toBeVisible();
  await page.getByTestId('thread-more').click();
  await page.getByTestId('thread-erase').click();
  await page.getByTestId('thread-erase-confirm').click();
  await expect(visible(page, 'Erased')).toBeVisible();
  await expect(
    // The owner did it, so to them it reads "You"; the customer reads the organization's name.
    visible(page, /You erased this conversation’s messages at Kareem Customer’s request/),
  ).toBeVisible();
  await expect(page.getByTestId('thread-bar')).toContainText('Erased at the customer’s request');
  await expect(
    visible(
      c,
      new RegExp(`Nile Dental ${stamp} erased this conversation’s messages at your request`),
    ),
  ).toBeVisible();
  await expect(visible(c, 'Please delete my records.')).toHaveCount(0);
  await c.screenshot({
    path: 'e2e/screenshots/phone-conversation-erased.png',
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
  expect(customerErrors).toEqual([]);
  await owner.close();
  await customerContext.close();
  void customer;
});
