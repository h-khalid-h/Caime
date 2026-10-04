/**
 * An organization's own door (R53): its page is the link a clinic puts on the door and the
 * receipt. Someone new who opens it signs up and lands in the conversation, as an invite's
 * guest does; the team sees the link and its QR code on the organization's page.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.door.${stamp}`;

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
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}`);
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
      const bookingBox = await page.getByTestId('org-booking').boundingBox();
      expect(doorBox && bookingBox && doorBox.y < bookingBox.y).toBe(true);
      await page.screenshot({
        path: 'e2e/screenshots/desktop-org-door.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
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
      await page.getByText('Copy the codes').click();
      await page.getByTestId('onboarding-codes-next').click();
      await page.getByTestId('onboarding-rules-next').click();
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
