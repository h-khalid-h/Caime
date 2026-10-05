/**
 * An organization's own checkout (R65): its owner connects its Stripe account on Stripe's page
 * (the stand-in's Connect), the team asks for a payment, and the customer pays by card on
 * Stripe's page and comes back to the conversation, where the card says it's paid.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.card.${stamp}`;
let orgId = '';
let owner: BrowserContext;
let customer: BrowserContext;
let convo = '';

test.describe
  .serial('paying an organization by card (R65)', () => {
    test.afterAll(async () => {
      await owner?.close();
      await customer?.close();
    });

    test('the owner connects the organization’s own Stripe account', async ({ browser }) => {
      owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(owner, 'Noor Haddad', `noor.card.${stamp}`);
      const made = await owner.request.post('/v1/orgs', {
        headers: CLIENT,
        data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
      });
      expect(made.ok(), await made.text()).toBe(true);
      orgId = ((await made.json()) as { org: { id: string } }).org.id;
      const { page, errors } = await newPerson(owner);
      await page.goto(`/o/${handle}/setup`);
      const card = page.getByTestId('org-checkout');
      await expect(card).toBeVisible();
      await page.getByTestId('org-checkout-connect').click();
      // Stripe's own page, then back to the setup.
      await page.getByRole('button', { name: 'Connect my Stripe account' }).click();
      await page.waitForURL(new RegExp(`/o/${handle.replace(/\./g, '\\.')}/setup`));
      await expect(visible(page, /Connected\. Cards paid on Pay cards go to/)).toBeVisible();
      await expect(page.getByTestId('org-checkout-cards')).toContainText('Accepted now');
      expect(errors).toEqual([]);
    });

    test('the customer pays a Pay card by card, and the card says it’s paid', async ({
      browser,
    }) => {
      customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await apiSignUp(customer, 'Lina Farah', `lina.card.${stamp}`);
      const started = await customer.request.post(`/v1/orgs/${orgId}/conversations`, {
        headers: CLIENT,
        data: {},
      });
      convo = ((await started.json()) as { conversationId: string }).conversationId;
      const asked = await owner.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: {
          clientId: randomUUID(),
          kind: 'kit',
          payload: {
            kit: 'payment_request',
            fields: {
              direction: 'ask',
              amount: { value: 400, currency: 'EGP' },
              note: 'Cleaning',
            },
          },
        },
      });
      expect(asked.ok(), await asked.text()).toBe(true);
      const { page, errors } = await newPerson(customer);
      await page.goto(`/c/${convo}`);
      const pay = page.getByTestId('pay-by-card').filter({ visible: true });
      await expect(pay).toBeVisible();
      await pay.click();
      // Stripe's page, on the organization's account: the amount, in its smallest unit.
      await expect(page.getByText('40000 EGP')).toBeVisible();
      await page.getByRole('button', { name: 'Pay by card' }).click();
      await page.waitForURL(new RegExp(`/c/${convo}`));
      await expect(visible(page, 'Paid. The card says so.')).toBeVisible();
      await expect(page.getByTestId('pay-paid-by-card').filter({ visible: true })).toBeVisible();
      await expect(page.getByTestId('pay-by-card').filter({ visible: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
