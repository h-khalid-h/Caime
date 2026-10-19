/**
 * Intake forms (M16 H5): the owner writes a form on the setup screen, one of its answers kept in a
 * customer field; the team sends it from a customer's conversation; the customer fills it in on
 * the card, on a phone; both sides read the answers there, and the kept answer is in the record.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.forms.${stamp}`;

/** A customer who writes to the organization: their conversation's id. */
async function writes(context: BrowserContext, name: string, orgId: string, body: string) {
  await apiSignUp(context, name, `${name.split(' ')[0]?.toLowerCase()}.forms.${stamp}`);
  const started = await context.request.post(`/v1/orgs/${orgId}/conversations`, {
    headers: CLIENT,
    data: {},
  });
  expect(started.ok(), await started.text()).toBe(true);
  const convo = ((await started.json()) as { conversationId: string }).conversationId;
  const sent = await context.request.post(`/v1/conversations/${convo}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), body },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  return convo;
}

test('a form is written, sent, answered on the card and kept in the record', async ({
  browser,
}) => {
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await apiSignUp(owner, 'Noor Forms', `noor.forms.${stamp}`);
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  // A field the form keeps an answer in (H3).
  const fields = await owner.request.put(`/v1/orgs/${orgId}/customer-fields`, {
    headers: CLIENT,
    data: { fields: [{ label: 'File number', kind: 'number' }] },
  });
  expect(fields.ok(), await fields.text()).toBe(true);
  const fileField = ((await fields.json()) as { fields: Array<{ id: string }> }).fields[0]?.id;
  const customer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const convo = await writes(customer, 'Salma Forms', orgId, 'Hello, can I book a check-up?');

  // The owner writes the form on the setup screen: one question needed, one kept in the record.
  const noor = await newPerson(owner);
  const page = noor.page;
  await page.goto(`/o/${handle}/setup`);
  await page.getByTestId('org-form-new').click();
  await page.getByTestId('org-form-name').fill('Before your visit');
  await page.getByTestId('org-form-question-label').fill('Any allergies?');
  await page.getByTestId('org-form-kind-longtext').click();
  await page.getByTestId('org-form-question-keep').click();
  await page.getByTestId('org-form-question-label').fill('File number');
  await page.getByTestId('org-form-kind-number').click();
  await page.getByTestId('org-form-required').click();
  await page.getByTestId('org-form-keep').click();
  await page.getByTestId(`org-form-keep-${fileField}`).click();
  await page.getByTestId('org-form-question-keep').click();
  await page.getByTestId('org-form-save').click();
  await expect(page.getByTestId('org-form-0')).toContainText('Before your visit');
  await expect(page.getByTestId('org-form-0')).toContainText('2 questions');

  // The team sends it from her conversation: the one form, chosen already.
  await page.goto(`/c/${convo}`);
  await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
  await page.getByTestId('kit-option-form').click();
  await page.getByTestId('kit-send').click();
  const sent = page.getByTestId('kit-form').filter({ visible: true });
  await expect(sent).toContainText('Before your visit');
  await expect(sent).toContainText('Waiting for the answers');

  // She fills it in on the card, on her phone: the file number in Arabic digits.
  const salma = await newPerson(customer);
  await salma.page.goto(`/c/${convo}`);
  const card = salma.page.getByTestId('kit-form').filter({ visible: true });
  await expect(card).toContainText('Before your visit');
  await card.getByTestId('form-fill-in').click();
  await salma.page.getByLabel('Any allergies?').fill('Penicillin');
  await salma.page.getByLabel('File number (if you like)').fill('١٢٣٤');
  await salma.page.screenshot({
    path: 'e2e/screenshots/phone-form-answers.png',
    animations: 'disabled',
  });
  await salma.page.getByTestId('form-send').click();
  await expect(card).toContainText('Filled in');
  await expect(card).toContainText('Penicillin');
  await expect(card).toContainText('1234');
  await expect(card.getByTestId('form-fill-in')).toHaveCount(0);

  // The team reads the answers on the card as they arrive, and the file number in her record.
  await expect(sent).toContainText('Penicillin');
  await expect(sent).toContainText('Filled in');
  const record = page.getByTestId('customer-record').filter({ visible: true });
  await expect(record.getByRole('button', { name: /File number/ })).toContainText('1234');
  await page.screenshot({
    path: 'e2e/screenshots/desktop-form-answered.png',
    animations: 'disabled',
  });
  expect(noor.errors).toEqual([]);
  expect(salma.errors).toEqual([]);
  await owner.close();
  await customer.close();
});
