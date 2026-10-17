/**
 * Booking before an account (R97 (1), block C): a visitor with no account picks a time on an
 * organization's item page, proves an address with the code the mail stand-in received, and the
 * team finds the request from the provisional customer in its Business inbox.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, visible } from './helpers';

test('a visitor books from the item page with a code, and the team sees the request', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const team = await browser.newContext();
  const noor = await apiSignUp(team, 'Noor Haddad', `noor.pb.${suffix}`);
  const made = await team.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle: `nile.pb.${suffix}`, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;
  // Every day, all day, no lead: whenever this runs, this week has a free time.
  const hours = await team.request.put(`/v1/orgs/${orgId}/booking`, {
    headers: CLIENT,
    data: {
      booking: {
        timeZone: 'Africa/Cairo',
        slotMinutes: 30,
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:30' })),
        leadMinutes: 0,
        horizonDays: 14,
      },
      items: [
        {
          id: 'cleaning',
          name: 'Cleaning',
          price: { value: 400, currency: 'EGP' },
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

  // A visitor: no account, no cookie, the page as the server paints it.
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`/o/nile.pb.${suffix}/cleaning`);
  await expect(visible(page, 'Book a time')).toBeVisible();
  const email = `ana.pb.${suffix}@example.com`;
  const slots = page.locator('input[name="slot"]');
  expect(await slots.count()).toBeGreaterThan(0);
  const chosen = (await slots.first().getAttribute('value')) as string;
  await slots.first().check();
  await page.locator('input[name="name"]').fill('Ana Costa');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="adult"]').check();
  await page.locator('#book button[type="submit"]').click();
  await expect(visible(page, 'Check your email')).toBeVisible();
  await expect(page).toHaveURL(/[?&]code=/);

  // The code, from the mail stand-in, typed on the page.
  let code = '';
  await expect
    .poll(async () => {
      const mails = await mailsTo(email);
      code = /^(\d{6}) /.exec(mails.at(-1)?.subject ?? '')?.[1] ?? '';
      return code;
    })
    .toMatch(/^\d{6}$/);
  await page.locator('input[name="code"]').fill(code);
  await page.locator('#book button[type="submit"]').click();
  await expect(visible(page, /Nile Dental confirms in your conversation/)).toBeVisible();
  await expect(page).toHaveURL(/[?&]booked=/);
  // Nothing of the team on the visitor's page; the way to follow it is joining with the address.
  await expect(page.getByText('Noor Haddad')).toHaveCount(0);
  await expect(visible(page, new RegExp(email))).toBeVisible();

  // The team: the request from the provisional customer, as any booking, at the chosen time.
  const inbox = await team.request.get(`/v1/orgs/${orgId}/inbox`, { headers: CLIENT });
  expect(inbox.ok(), await inbox.text()).toBe(true);
  type Thread = { conversationId: string; customer?: { displayName?: string } };
  type Card = {
    kind: string;
    senderId: string;
    payload: { kit: string; state: string; fields: { start: { at: string } } };
  };
  const threads = ((await inbox.json()) as { threads: Thread[] }).threads;
  const thread = threads.find((th) => th.customer?.displayName === 'Ana Costa');
  expect(thread, JSON.stringify(threads.map((th) => th.customer?.displayName))).toBeDefined();
  const messages = await team.request.get(`/v1/conversations/${thread?.conversationId}/messages`, {
    headers: CLIENT,
  });
  const card = ((await messages.json()) as { messages: Card[] }).messages.find(
    (m) => m.kind === 'kit',
  );
  expect(card?.payload.kit).toBe('appointment');
  expect(card?.payload.state).toBe('requested');
  expect(card?.payload.fields.start.at).toBe(chosen);
  expect(card?.senderId).not.toBe(noor.id);

  // The time is held: the page no longer offers it.
  await page.goto(`/o/nile.pb.${suffix}/cleaning`);
  await expect(page.locator(`input[name="slot"][value="${chosen}"]`)).toHaveCount(0);
  await visitor.close();
  await team.close();
});
