/**
 * What an organization's conversations came to (M16 H4): on Business, its owner reads on the
 * organization's page what customers booked, ordered and paid, who bought, what was ordered most
 * and when customers write; nothing a customer wrote, and nobody on the team singled out.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, test } from '@playwright/test';
import { ADMIN_TOKEN, apiSignUp, CLIENT, newPerson } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.numbers.${stamp}`;
const BRUSH = {
  id: 'brush',
  name: 'Toothbrush',
  price: { value: 50, currency: 'EGP' },
  unit: 'each',
  minutes: null,
  capacity: 1,
  maxQuantity: 5,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};

/** Sends a message as whoever the context is signed in as: its id. */
async function post(context: BrowserContext, conversationId: string, data: object) {
  const res = await context.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), ...data },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { message: { id: string } }).message.id;
}
async function move(context: BrowserContext, id: string, to: string) {
  const res = await context.request.post(`/v1/messages/${id}/kit`, {
    headers: CLIENT,
    data: { to },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

test('an owner on Business reads what the conversations came to', async ({ browser }) => {
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await apiSignUp(owner, 'Noor Numbers', `noor.numbers.${stamp}`);
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  // The operator moves it to Business, where insights are.
  const upgraded = await owner.request.put(`/v1/admin/orgs/${handle}/plan`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    data: { plan: 'business' },
  });
  expect(upgraded.status()).toBe(200);
  const saved = await owner.request.put(`/v1/orgs/${orgId}/booking`, {
    headers: CLIENT,
    data: {
      booking: HOURS,
      items: [BRUSH],
      ordering: { fulfilment: ['pickup'], note: null },
      payments: {
        methods: [{ id: 'cash', kind: 'cash', label: 'Cash', audience: 'public' }],
        note: null,
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);

  // Salma orders three toothbrushes in the conversation; the team asks her to pay, and she does.
  const customer = await browser.newContext();
  await apiSignUp(customer, 'Salma Numbers', `salma.numbers.${stamp}`);
  const started = await customer.request.post(`/v1/orgs/${orgId}/conversations`, {
    headers: CLIENT,
    data: {},
  });
  expect(started.ok(), await started.text()).toBe(true);
  const convo = ((await started.json()) as { conversationId: string }).conversationId;
  await post(customer, convo, { body: 'Hello, three toothbrushes please.' });
  await post(customer, convo, {
    kind: 'kit',
    payload: {
      kit: 'order_status',
      fields: {},
      order: { lines: [{ itemId: 'brush', quantity: 3 }] },
    },
  });
  const pay = await post(owner, convo, {
    kind: 'kit',
    payload: {
      kit: 'payment_request',
      fields: { direction: 'ask', amount: { value: 150, currency: 'EGP' } },
    },
  });
  await move(customer, pay, 'sent');
  await move(owner, pay, 'paid');

  const noor = await newPerson(owner);
  const page = noor.page;
  await page.goto(`/o/${handle}`);
  const commerce = page.getByTestId('insight-commerce').filter({ visible: true });
  await expect(commerce).toContainText('Booked, ordered and paid');
  await expect(commerce.getByTestId('insight-orders')).toContainText(/Orders\s*1/);
  await expect(commerce.getByTestId('insight-orders')).toContainText(/Worth EGP\s?150/);
  await expect(commerce.getByTestId('insight-paid')).toContainText(/EGP\s?150/);
  await expect(commerce.getByTestId('insight-bought')).toContainText('Of 1 who wrote');
  await expect(commerce.getByTestId('insight-top')).toContainText(/Toothbrush\s*3/);
  await expect(commerce.getByTestId('insight-busiest')).toContainText('Most often on');
  await expect(commerce.getByTestId('insight-hours')).toHaveAttribute(
    'aria-label',
    /Most often on/,
  );
  // Nothing a customer wrote, nor their name.
  await expect(commerce).not.toContainText('Salma');
  await expect(commerce).not.toContainText('toothbrushes please');
  await commerce.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screenshots/desktop-org-insights-commerce.png' });
  expect(noor.errors).toEqual([]);
  await owner.close();
  await customer.close();
});
