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
  const slots = page.locator('#book input[name="slot"]');
  expect(await slots.count()).toBeGreaterThan(0);
  const chosen = (await slots.first().getAttribute('value')) as string;
  await slots.first().check();
  await page.locator('#book input[name="name"]').fill('Ana Costa');
  await page.locator('#book input[name="email"]').fill(email);
  await page.locator('#book input[name="adult"]').check();
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
  await page.locator('#book input[name="code"]').fill(code);
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
    id: string;
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

  // The team confirms: the booker, who has no device on Caime, hears by mail (C1b).
  const moved = await team.request.post(`/v1/messages/${card?.id}/kit`, {
    headers: CLIENT,
    data: { to: 'confirmed' },
  });
  expect(moved.ok(), await moved.text()).toBe(true);
  await expect
    .poll(async () => (await mailsTo(email)).map((m) => m.subject))
    .toContain('Confirmed: Cleaning with Nile Dental');
  const confirmation = (await mailsTo(email)).find((m) => m.subject.startsWith('Confirmed:'));
  expect(confirmation?.text).toContain('Nile Dental confirmed your booking');
  expect(confirmation?.text).toContain('/sign-up?link=');

  // The booker joins with the same address: the form asks for the code sent to it before the
  // booking comes with the account (review 2026-10-17 §2 H1), and then it's theirs.
  const codesSoFar = (await mailsTo(email)).filter((m) => /^\d{6} /.test(m.subject)).length;
  await page.goto('/sign-up');
  await page.getByTestId('signup-name').fill('Ana Costa');
  await page.getByTestId('signup-handle').fill(`ana.pb.${suffix}`);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill('a long enough passphrase');
  await page.getByTestId('signup-birth-date').fill('1990-12-31');
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByTestId('signup-submit').click();
  const codeField = page.getByTestId('signup-email-code');
  await expect(codeField).toBeVisible();
  await expect(visible(page, /Messages are waiting for this address on Caime/)).toBeVisible();
  let claimCode = '';
  await expect
    .poll(async () => {
      const codes = (await mailsTo(email)).filter((m) => /^\d{6} /.test(m.subject));
      claimCode = codes.length > codesSoFar ? (codes.at(-1)?.subject.slice(0, 6) ?? '') : '';
      return claimCode;
    })
    .toMatch(/^\d{6}$/);
  await codeField.fill(claimCode);
  await page.getByTestId('signup-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-up'));
  const mine = await page.request.get('/v1/inbox?view=all', { headers: CLIENT });
  expect(mine.ok(), await mine.text()).toBe(true);
  const conversations = ((await mine.json()) as { conversations: Array<{ id: string }> })
    .conversations;
  expect(conversations.map((c) => c.id)).toContain(thread?.conversationId);
  await visitor.close();
  await team.close();
});

test('a visitor books a person’s lesson from their page, and confirming it answers the request', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const host = await browser.newContext();
  await apiSignUp(host, 'Lina Haddad', `lina.pb.${suffix}`);
  const set = await host.request.put('/v1/me/booking', {
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
          id: 'lesson',
          name: 'Lesson',
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
  expect(set.ok(), await set.text()).toBe(true);

  // A visitor, with no account, on Lina's lesson page as the server paints it.
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`/@lina.pb.${suffix}/lesson`);
  await expect(visible(page, 'Book a time')).toBeVisible();
  const email = `omar.pb.${suffix}@example.com`;
  const slots = page.locator('#book input[name="slot"]');
  const chosen = (await slots.first().getAttribute('value')) as string;
  await slots.first().check();
  await page.locator('#book input[name="name"]').fill('Omar Visitor');
  await page.locator('#book input[name="email"]').fill(email);
  await page.locator('#book input[name="adult"]').check();
  await page.locator('#book button[type="submit"]').click();
  await expect(visible(page, 'Check your email')).toBeVisible();
  let code = '';
  await expect
    .poll(async () => {
      code = /^(\d{6}) /.exec((await mailsTo(email)).at(-1)?.subject ?? '')?.[1] ?? '';
      return code;
    })
    .toMatch(/^\d{6}$/);
  await page.locator('#book input[name="code"]').fill(code);
  await page.locator('#book button[type="submit"]').click();
  await expect(visible(page, /Lina Haddad confirms in your conversation/)).toBeVisible();

  // Lina, in the app: a message request holding the lesson; confirming it answers the request.
  const inbox = await host.request.get('/v1/inbox?view=all', { headers: CLIENT });
  type Row = { id: string; request: string | null };
  const row = ((await inbox.json()) as { conversations: Row[] }).conversations.find(
    (c) => c.request === 'incoming',
  );
  expect(row).toBeDefined();
  const linaPage = await host.newPage();
  await linaPage.goto(`/c/${row?.id}`);
  await expect(linaPage.getByTestId('request-incoming').filter({ visible: true })).toBeVisible();
  const card = linaPage.getByTestId('kit-appointment').filter({ hasText: 'Lesson', visible: true });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(linaPage.getByTestId('request-incoming').filter({ visible: true })).toHaveCount(0);
  await expect
    .poll(async () => (await mailsTo(email)).map((m) => m.subject))
    .toContain('Confirmed: Lesson with Lina Haddad');
  const told = (await mailsTo(email)).find((m) => m.subject.startsWith('Confirmed:'));
  expect(told?.text).toContain('Lina Haddad confirmed your booking');
  // The time she confirmed is the one the visitor chose.
  const messages = await host.request.get(`/v1/conversations/${row?.id}/messages`, {
    headers: CLIENT,
  });
  type Card = { kind: string; payload: { state: string; fields: { start: { at: string } } } };
  const lesson = ((await messages.json()) as { messages: Card[] }).messages.find(
    (m) => m.kind === 'kit',
  );
  expect(lesson?.payload.state).toBe('confirmed');
  expect(lesson?.payload.fields.start.at).toBe(chosen);
  await visitor.close();
  await host.close();
});
