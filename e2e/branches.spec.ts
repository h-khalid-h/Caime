/**
 * Branches as booking hosts (R92): a clinic's owner puts its cleaning at the Maadi branch and
 * gives the branch its own hours in the setup; a customer sees where on the card's form, books
 * a slot, and the appointment card says where it is.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);
const handle = `branch.dental.${stamp}`;

test('an item at a branch: its own hours in the setup, and the card says where', async ({
  browser,
}) => {
  const owner = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await apiSignUp(owner, 'Noor Branches', `noor.branches.${stamp}`);
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { name: `Branch Dental ${stamp}`, handle, kind: 'clinic', country: 'EG' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  const placed = await owner.request.put(`/v1/orgs/${orgId}/places`, {
    headers: CLIENT,
    data: {
      places: [
        {
          kind: 'branch',
          label: 'Maadi',
          country: 'EG',
          city: 'Cairo',
          street: '9 Road 233',
          orgAudience: 'customers',
        },
      ],
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const maadi = ((await placed.json()) as { places: Array<{ id: string }> }).places[0]?.id ?? '';
  const offered = await owner.request.put(`/v1/orgs/${orgId}/booking`, {
    headers: CLIENT,
    data: {
      booking: {
        timeZone: 'Africa/Cairo',
        slotMinutes: 30,
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '08:00', end: '20:00' })),
        leadMinutes: 0,
        horizonDays: 14,
      },
      items: [
        {
          id: 'cleaning',
          name: 'Cleaning',
          price: null,
          unit: 'minutes',
          minutes: 30,
          capacity: 1,
          maxQuantity: 1,
          audience: 'public',
          providers: null,
          askTopic: false,
        },
      ],
    },
  });
  expect(offered.ok(), await offered.text()).toBe(true);

  // The owner puts the cleaning at Maadi, and gives Maadi hours of its own.
  const { page, errors } = await newPerson(owner);
  await page.goto(`/o/${handle}/setup`);
  await visible(page, 'Cleaning').click();
  await page.getByTestId(`org-booking-item-at-${maadi}`).click();
  await page.getByTestId('org-booking-item-save').click();
  const row = page.getByTestId(`org-booking-branch-${maadi}`);
  await expect(row).toContainText('Hours at Maadi');
  await expect(row).toContainText('Same as the organization’s');
  await row.click();
  await page.getByTestId('org-booking-branch-hours-save').click();
  await expect(row).not.toContainText('Same as the organization’s');
  expect(errors).toEqual([]);

  // A customer books it: the form says where, and so does the card.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await apiSignUp(phone, 'Salma Branches', `salma.branches.${stamp}`);
  const started = await phone.request.post(`/v1/orgs/${orgId}/conversations`, {
    headers: CLIENT,
    data: {},
  });
  const convo = ((await started.json()) as { conversationId: string }).conversationId;
  const customer = await newPerson(phone);
  await customer.page.goto(`/c/${convo}?book=1`);
  await expect(customer.page.getByTestId('book-item-line')).toContainText('At Maadi');
  const picker = customer.page.getByTestId('slot-picker');
  await expect(picker).toBeVisible();
  await picker.locator('[data-testid^="slot-"]').first().click();
  await customer.page.getByTestId('kit-send').click();
  const card = customer.page.getByTestId('kit-appointment').first();
  await expect(card).toContainText('9 Road 233, Cairo');
  expect(customer.errors).toEqual([]);
  await owner.close();
  await phone.close();
});
