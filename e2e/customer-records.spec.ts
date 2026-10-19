/**
 * What a team keeps about its customers (M16 H3): the owner defines the fields on the setup
 * screen; the team keeps a tag, a field and a note from the customer's conversation, beside who
 * they are; the inbox shows the tag on the row and filters by it; the customer sees none of it.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `nile.records.${stamp}`;
const NOTE = 'Prefers mornings. Nervous about needles.';

/** A customer who writes to the organization: their conversation's id. */
async function writes(context: BrowserContext, name: string, orgId: string, body: string) {
  await apiSignUp(context, name, `${name.split(' ')[0]?.toLowerCase()}.records.${stamp}`);
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

test('a team keeps a tag, a field and a note about a customer, for itself alone', async ({
  browser,
}) => {
  const owner = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await apiSignUp(owner, 'Noor Records', `noor.records.${stamp}`);
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { name: `Nile Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  const customer = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const convo = await writes(customer, 'Salma Records', orgId, 'Hello, can I book a check-up?');
  const other = await browser.newContext();
  await writes(other, 'Karim Records', orgId, 'Do you do whitening?');

  // The fields, on the setup screen.
  const noor = await newPerson(owner);
  const page = noor.page;
  await page.goto(`/o/${handle}/setup`);
  await page.getByTestId('org-customer-fields').click();
  await page.getByTestId('customer-field-label').fill('File number');
  await page.getByTestId('customer-field-kind-number').click();
  await page.getByTestId('customer-field-keep').click();
  await page.getByTestId('customer-field-label').fill('Found us');
  await page.getByTestId('customer-field-kind-choice').click();
  await page.getByTestId('customer-field-choices-input').fill('A friend\nInstagram');
  await page.getByTestId('customer-fields-save').click();
  await expect(page.getByTestId('org-customer-fields')).toContainText('File number');

  // In her conversation's details: a tag, the file number in Arabic digits, a note.
  await page.goto(`/c/${convo}`);
  const record = page.getByTestId('customer-record').filter({ visible: true });
  await expect(record).toContainText('What your team keeps about Salma Records');
  await record.getByTestId('customer-tag-add').click();
  const tag = record.getByTestId('customer-tag-input');
  await tag.fill('VIP');
  await tag.press('Enter');
  await expect(record.getByTestId('customer-tag-VIP')).toBeVisible();
  await record.getByRole('button', { name: /File number/ }).click();
  await page.getByTestId('customer-field-value').fill('١٢٣٤');
  await page.getByTestId('customer-field-save').click();
  await expect(record.getByRole('button', { name: /File number/ })).toContainText('1234');
  await record.getByTestId('customer-note').fill(NOTE);
  await record.getByTestId('customer-note-save').click();
  await expect(record).toContainText('Changed just now: You');
  await page.screenshot({
    path: 'e2e/screenshots/desktop-customer-record.png',
    animations: 'disabled',
  });

  // The inbox: her tag on her row, and only her when it's chosen.
  await page.goto(`/o/${handle}/inbox`);
  const rows = page.locator('[data-testid^="thread-row-"]').filter({ visible: true });
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('thread-tag').filter({ visible: true })).toHaveText(['VIP']);
  await page.getByTestId('inbox-tag-VIP').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Salma Records');

  // Salma sees none of it.
  const salma = await newPerson(customer);
  await salma.page.goto(`/c/${convo}`);
  await expect(visible(salma.page, 'Hello, can I book a check-up?')).toBeVisible();
  await expect(salma.page.getByText(NOTE)).toHaveCount(0);
  await expect(salma.page.getByTestId('customer-record')).toHaveCount(0);
  expect(noor.errors).toEqual([]);
  expect(salma.errors).toEqual([]);
  await owner.close();
  await customer.close();
  await other.close();
});
