/**
 * The business front door (M16 C2a): an organization closes a day from its setup and its page
 * offers no time on it; the door carries the way to book beside it; and "Start free" on the page
 * for organizations signs a new owner up and lands them on starting theirs.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, visible } from './helpers';

/** A day on Cairo's clock, `days` from now, as the hours name one. */
const cairoDay = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
    new Date(Date.now() + days * 86_400_000),
  );

test('a closed day leaves the item page without times, and the door carries the Book link', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const team = await browser.newContext();
  await apiSignUp(team, 'Noor Haddad', `noor.fd.${suffix}`);
  const handle = `nile.fd.${suffix}`;
  const made = await team.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  const hours = await team.request.put(`/v1/orgs/${orgId}/booking`, {
    headers: CLIENT,
    data: {
      booking: {
        timeZone: 'Africa/Cairo',
        slotMinutes: 30,
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
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
  expect(hours.ok(), await hours.text()).toBe(true);

  // The setup: the door, and beside it the one item's own page to book from.
  const page = await team.newPage();
  await page.goto(`/o/${handle}/setup`);
  const book = page.getByTestId('org-door-book-link').filter({ visible: true });
  await expect(book).toContainText(`/o/${handle}/cleaning`);
  await expect(page.getByTestId('org-door-book-qr').filter({ visible: true })).toBeVisible();

  // Two days from now, closed for a holiday, from the hours' own section.
  const closed = cairoDay(2);
  await page.getByTestId('org-booking-add-closed').filter({ visible: true }).click();
  await page.getByTestId('org-booking-closed-from').filter({ visible: true }).fill(closed);
  await page.getByTestId('org-booking-closed-note').filter({ visible: true }).fill('Holiday');
  await page.getByTestId('org-booking-closed-save').filter({ visible: true }).click();
  await expect(page.getByTestId('org-booking-closed-0').filter({ visible: true })).toContainText(
    'Holiday',
  );
  const saved = await team.request.get(`/v1/orgs/${orgId}`, { headers: CLIENT });
  type Closed = { from: string; to: string; note?: string };
  const org = (await saved.json()) as { org: { booking: { closed?: Closed[] } } };
  expect(org.org.booking.closed).toEqual([{ from: closed, to: closed, note: 'Holiday' }]);

  // A visitor's week from that day: times on the days after it, none on it.
  const visitor = await browser.newContext();
  const item = await visitor.newPage();
  await item.goto(`/o/${handle}/cleaning?from=${closed}`);
  await expect(visible(item, 'Book a time')).toBeVisible();
  const times = await item
    .locator('input[name="slot"]')
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
  expect(times.length).toBeGreaterThan(0);
  const onCairoDay = (at: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(at));
  expect(times.filter((at) => onCairoDay(at) === closed)).toEqual([]);
  expect(times.some((at) => onCairoDay(at) === cairoDay(3))).toBe(true);
  await visitor.close();
  await team.close();
});

test('Start free on the page for organizations lands a new owner on starting theirs', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  // A network of its own (a documentation range): the suite signs up more than one address may.
  const owner = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.21' },
  });
  const page = await owner.newPage();
  await page.goto('/business');
  await page.getByRole('link', { name: 'Start free' }).first().click();
  await page.waitForURL((url) => url.pathname === '/sign-up');
  expect(new URL(page.url()).searchParams.get('link')).toBe('/orgs/new');
  await page.getByTestId('signup-name').fill('Rana Owner');
  await page.getByTestId('signup-handle').fill(`rana.fd.${suffix}`);
  await page.getByTestId('signup-email').fill(`rana.fd.${suffix}@example.com`);
  await page.getByTestId('signup-password').fill('a long enough passphrase');
  await page.getByTestId('signup-birth-date').fill('1988-06-15');
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByTestId('signup-submit').click();
  await page.waitForURL('**/onboarding');
  const next = page.getByTestId('onboarding-link');
  await expect(next).toHaveText('Start your organization');
  await next.click();
  await page.waitForURL((url) => url.pathname === '/orgs/new');
  await owner.close();
});
