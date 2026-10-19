/**
 * An organization's own replies (M16 H2): its owner writes a greeting, an away message and quick
 * replies on its setup screen; a customer who writes while it's closed is greeted and told when
 * it opens again, from the organization, marked automated; and the team puts a quick reply in
 * with "/" and its shortcut.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.replies.${stamp}`;
const GREETING = 'Welcome to Nile Dental! Tell us what you need.';
const AWAY = 'Thanks for writing. We answer as soon as we’re back.';
const HOURS_REPLY = 'We’re open every day from nine.';
let orgId = '';
let ownerState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

test.describe
  .serial('an organization’s own replies (M16 H2)', () => {
    test('its owner writes a greeting, an away message and quick replies where it sets up', async ({
      browser,
    }) => {
      const owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(owner, 'Noor Replies', `noor.replies.${stamp}`);
      const made = await owner.request.post('/v1/orgs', {
        headers: CLIENT,
        data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
      });
      expect(made.ok(), await made.text()).toBe(true);
      orgId = ((await made.json()) as { org: { id: string } }).org.id;
      // Open tomorrow alone, so it's closed now whatever the time, and opens tomorrow at nine.
      const tomorrow = (new Date().getUTCDay() + 1) % 7;
      const hours = await owner.request.put(`/v1/orgs/${orgId}/booking`, {
        headers: CLIENT,
        data: {
          booking: {
            timeZone: 'UTC',
            slotMinutes: 30,
            days: [{ weekday: tomorrow, start: '09:00', end: '17:00' }],
            leadMinutes: 0,
            horizonDays: 14,
          },
        },
      });
      expect(hours.ok(), await hours.text()).toBe(true);
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      // The greeting.
      await page.getByTestId('org-greeting').click();
      await page.getByTestId('org-reply-text').fill(GREETING);
      await page.getByTestId('org-reply-save').click();
      await expect(page.getByTestId('org-greeting')).toContainText(GREETING);
      // The away message, which says Caime adds when it opens again.
      await page.getByTestId('org-away').click();
      await expect(visible(page, /Caime adds when you open again/)).toBeVisible();
      await page.getByTestId('org-reply-text').fill(AWAY);
      await page.getByTestId('org-reply-save').click();
      await expect(page.getByTestId('org-away')).toContainText(AWAY);
      // Two quick replies, the shortcut's "/" typed or not.
      await page.getByTestId('org-quick-replies').click();
      await page.getByTestId('quick-reply-shortcut').fill('/hours');
      await page.getByTestId('quick-reply-body').fill(HOURS_REPLY);
      await page.getByTestId('quick-reply-keep').click();
      await page.getByTestId('quick-reply-shortcut').fill('price');
      await page.getByTestId('quick-reply-body').fill('A check-up is 400 EGP.');
      await page.getByTestId('quick-reply-keep').click();
      await expect(page.getByTestId('quick-reply-0')).toContainText('/hours');
      await page.getByTestId('quick-replies-save').click();
      await expect(page.getByTestId('org-quick-replies')).toContainText('2 kept');
      await page.screenshot({
        path: 'e2e/screenshots/desktop-org-replies.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      ownerState = await owner.storageState();
      await owner.close();
    });

    test('a customer is greeted and told when it opens; the team answers with a quick reply', async ({
      browser,
    }) => {
      const customer = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(customer, 'Salma Replies', `salma.replies.${stamp}`);
      const started = await customer.request.post(`/v1/orgs/${orgId}/conversations`, {
        headers: CLIENT,
        data: {},
      });
      expect(started.ok(), await started.text()).toBe(true);
      const convo = ((await started.json()) as { conversationId: string }).conversationId;
      const sent = await customer.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'Hello, are you open?' },
      });
      expect(sent.ok(), await sent.text()).toBe(true);
      const salma = await newPerson(customer);
      await salma.page.goto(`/c/${convo}`);
      // From the organization, marked automated: the greeting, then the away message with when
      // it opens again, on her clock.
      await expect(visible(salma.page, GREETING)).toBeVisible({ timeout: 20_000 });
      await expect(visible(salma.page, /We’re open again tomorrow at 9:00/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(visible(salma.page, /Automated/)).toBeVisible();

      // The team answers with "/" and the start of a shortcut.
      const owner = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: ownerState,
      });
      const noor = await newPerson(owner);
      await noor.page.goto(`/c/${convo}`);
      const input = noor.page.getByTestId('composer-input').filter({ visible: true });
      await input.fill('/');
      const picker = noor.page.getByTestId('quick-reply-picker');
      await expect(picker.getByTestId('quick-reply-option')).toHaveCount(2);
      await input.fill('/ho');
      await expect(picker.getByTestId('quick-reply-option')).toHaveCount(1);
      await input.press('Enter');
      await expect(input).toHaveValue(HOURS_REPLY);
      await expect(noor.page.getByTestId('quick-reply-picker')).toHaveCount(0);
      await noor.page.getByTestId('composer-send').filter({ visible: true }).click();
      await expect(visible(salma.page, HOURS_REPLY)).toBeVisible();
      expect(salma.errors).toEqual([]);
      expect(noor.errors).toEqual([]);
      await customer.close();
      await owner.close();
    });
  });
