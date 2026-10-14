/**
 * Meetings (R83): Join on an accepted meeting's card opens its call; the other side's Join, from
 * the address the calendar and calendar apps use, answers the call already ringing rather than
 * placing a second; Meetings lists it with its Join. A guest (R84) invited by address from the
 * card joins from their own link, without an account, and is in the meeting's call. A meeting
 * that repeats (R58) is agreed once, until a day if it's given one; the calendar has each time
 * ahead until it's stopped.
 */
import { randomUUID } from 'node:crypto';
import { type Browser, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, newPerson } from './helpers';

/** Ana and Ben, connected at work, with their conversation. */
async function colleagues(browser: Browser) {
  const anaCtx = await browser.newContext();
  const benCtx = await browser.newContext();
  const ana = await newPerson(anaCtx);
  const ben = await newPerson(benCtx);
  const tag = randomUUID().slice(0, 6);
  await apiSignUp(anaCtx, 'Ana Meet', `ana_meet_${tag}`);
  const benUser = await apiSignUp(benCtx, 'Ben Meet', `ben_meet_${tag}`);
  const asked = await anaCtx.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: benUser.id, relationship: { sphere: 'work', role: 'colleague' } },
  });
  expect(asked.ok(), await asked.text()).toBe(true);
  const { requestId } = (await asked.json()) as { requestId: string };
  const took = await benCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  expect(took.ok(), await took.text()).toBe(true);
  const made = await anaCtx.request.post('/v1/conversations', {
    headers: CLIENT,
    data: { kind: 'direct', userId: benUser.id },
  });
  const conversationId = ((await made.json()) as { conversation: { id: string } }).conversation.id;
  return { anaCtx, benCtx, ana, ben, conversationId, tag };
}

/** Ana and Ben, connected, and a meeting held here starting in two minutes, accepted by Ben. */
async function agreedMeeting(browser: Browser, title: string) {
  const { anaCtx, benCtx, ana, ben, conversationId, tag } = await colleagues(browser);
  const at = new Date(Date.now() + 2 * 60_000).toISOString();
  const sent = await anaCtx.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: { title, start: { at, hasTime: true }, durationMinutes: 30 },
      },
    },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const card = ((await sent.json()) as { message: { id: string; seq: number } }).message;
  const accepted = await benCtx.request.post(`/v1/messages/${card.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);
  return { anaCtx, benCtx, ana, ben, conversationId, card, tag };
}

test('a meeting held on Caime is joined from its card, its address and Meetings', async ({
  browser,
}) => {
  const { anaCtx, benCtx, ana, ben, conversationId, card } = await agreedMeeting(
    browser,
    'Plan the launch',
  );

  // Meetings lists it with its Join.
  await ana.page.goto('/meetings');
  await expect(ana.page.getByTestId('meetings-list')).toBeVisible();
  await expect(ana.page.getByText('Plan the launch').first()).toBeVisible();
  await expect(ana.page.getByTestId(`calendar-join-${card.id}`)).toBeVisible();

  // Ana joins from the card: Ben is rung.
  await ana.page.goto(`/c/${conversationId}`);
  await ana.page.getByTestId('kit-join').click();
  await expect(ana.page.getByTestId('call-status')).toHaveText('Calling…');

  // Ben joins from the meeting's address (as his calendar app opens it): the ringing call is
  // answered, not met with a second one.
  await ben.page.goto(`/c/${conversationId}?seq=${card.seq}&join=${card.id}`);
  await expect(ana.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });
  await expect(ben.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });

  // Nothing refused on either side: the second Join answered the ring rather than placing a
  // call that would be refused as already on.
  expect([...ana.errors, ...ben.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
});

test('a guest invited by email joins from their own link, and is in the meeting’s call', async ({
  browser,
}) => {
  // Three people, a mail, a call: more than one page's steps.
  test.setTimeout(150_000);
  const { anaCtx, benCtx, ana, conversationId, tag } = await agreedMeeting(browser, 'Guest review');
  const email = `gus_${tag}@example.com`;

  // Ana invites Gus by address from the card: the meeting moves to its own space, which opens.
  await ana.page.goto(`/c/${conversationId}`);
  const original = ana.page.getByTestId('kit-meeting').filter({ hasText: 'Guest review' });
  await original.getByTestId('kit-invite').click();
  await ana.page.getByTestId('guest-email').fill(email);
  await ana.page.getByTestId('guest-name').fill('Gus Guest');
  await ana.page.getByTestId('guest-send').click();
  await expect(ana.page).not.toHaveURL(new RegExp(conversationId));
  const space = ana.page.url().split('/c/')[1]?.split('?')[0] ?? '';
  await expect(
    ana.page.getByTestId('kit-meeting').filter({ hasText: 'Guest review' }),
  ).toBeVisible();

  // The calendar invitation, with Gus's own link.
  await expect.poll(async () => (await mailsTo(email)).length).toBe(1);
  const [mail] = await mailsTo(email);
  const link = /\/j\/cmg_[A-Za-z0-9_-]+/.exec(mail?.text ?? '')?.[0] ?? '';
  expect(link).not.toBe('');

  // Gus, in a browser with nothing of Caime: what it is, who asked, the name, the age, Join.
  const gusCtx = await browser.newContext();
  const gus = await newPerson(gusCtx);
  await gus.page.goto(link);
  await expect(gus.page.getByTestId('join-form')).toBeVisible();
  await expect(gus.page.getByText('Guest review').first()).toBeVisible();
  await expect(gus.page.getByTestId('join-form')).toContainText('Ana Meet');
  await expect(gus.page.getByTestId('join-name')).toHaveValue('Gus Guest');
  await gus.page.getByTestId('join-adult').getByRole('switch').click();
  await gus.page.getByTestId('join-submit').click();
  const meeting = gus.page.getByTestId('guest-meeting');
  await expect(meeting).toBeVisible();
  await expect(meeting).toContainText('Ana Meet');
  await expect(meeting).toContainText('Ben Meet');

  // Ana starts the call from the space's card; Gus is rung and joins it.
  await ana.page.goto(`/c/${space}`);
  await ana.page
    .getByTestId('kit-meeting')
    .filter({ hasText: 'Guest review' })
    .getByTestId('kit-join')
    .click();
  await gus.page.getByTestId('group-call-join').click({ timeout: 20_000 });
  await expect(ana.page.getByTestId('group-call-status')).toHaveText(/^0:\d\d$/, {
    timeout: 20_000,
  });
  await expect(gus.page.getByTestId('group-call-status')).toHaveText(/^0:\d\d$/, {
    timeout: 20_000,
  });
  // Ana leaves while Gus is still in it; Gus goes on to another address with the call left behind.
  await ana.page.getByTestId('group-call-leave').click();

  // Anywhere else Gus goes is their meeting: none of the app is theirs.
  await gus.page.goto('/');
  await expect(gus.page).toHaveURL(new RegExp(link.replace(/[/]/g, '\\/')));
  await expect(gus.page.getByTestId('guest-meeting')).toBeVisible();

  // Nothing Gus's page asked for was refused (the server allows a guest only their meeting). A
  // route candidate already on its way when Ana's leaving ended the call is refused as over
  // (409, by design: a signal to an ended call says so); that race is the only one let through.
  const lateCandidate = (e: string) =>
    /^409 POST .*\/v1\/group-calls\/[0-9a-f-]+\/signal$/.test(e) ||
    e === 'console: Failed to load resource: the server responded with a status of 409 (Conflict)';
  expect([...ana.errors, ...gus.errors].filter((e) => !lateCandidate(e))).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
  await gusCtx.close();
});

test('a meeting that repeats is agreed once, and the calendar has each week until it stops', async ({
  browser,
}) => {
  const { anaCtx, benCtx, ana, ben, conversationId } = await colleagues(browser);
  const seen = (page: typeof ana.page, id: string) =>
    page.getByTestId(id).filter({ visible: true });

  // Ana proposes a weekly one from the card's form.
  await ana.page.goto(`/c/${conversationId}`);
  await ana.page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
  await ana.page.getByTestId('kit-option-meeting').click();
  await ana.page.getByLabel('Title').fill('Weekly sync');
  await ana.page.getByLabel('When', { exact: true }).fill('Friday 3pm');
  // Its last day is asked once it repeats (every workday is offered too, R76).
  await expect(ana.page.getByTestId('kit-field-repeatUntil')).toHaveCount(0);
  await expect(ana.page.getByRole('radio', { name: 'Every workday', exact: true })).toBeVisible();
  await ana.page.getByRole('radio', { name: 'Every week', exact: true }).click();
  await ana.page.getByLabel('Until (optional)').fill('in two months');
  await ana.page.getByTestId('kit-send').click();
  const mine = ana.page.getByTestId('kit-meeting').filter({ hasText: 'Weekly sync' });
  await expect(mine).toContainText('Every week');
  await expect(mine).toContainText('Until');
  const listed = await anaCtx.request.get(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
  });
  const { messages } = (await listed.json()) as {
    messages: Array<{ id: string; payload: { kit?: string } }>;
  };
  const cardId = messages.find((m) => m.payload.kit === 'meeting')?.id ?? '';

  // Ben accepts it once; a time of it is cancelled on its own.
  await ben.page.goto(`/c/${conversationId}`);
  const theirs = ben.page
    .getByTestId('kit-meeting')
    .filter({ hasText: 'Weekly sync', visible: true });
  await theirs.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(theirs).toContainText('Accepted');
  await expect(theirs.getByRole('button', { name: 'Cancel this one', exact: true })).toBeVisible();

  // Ben's calendar has the weeks ahead before each is posted; Meetings lists the card alone.
  await ben.page.goto('/actions?view=calendar');
  await expect(seen(ben.page, `calendar-item-${cardId}`)).toBeVisible();
  await expect(seen(ben.page, `calendar-item-${cardId}:1`)).toContainText('Every week');
  await expect(seen(ben.page, `calendar-item-${cardId}:2`)).toBeVisible();
  await ben.page.screenshot({ path: 'e2e/screenshots/desktop-calendar-repeating.png' });
  await ben.page.goto('/meetings');
  await expect(seen(ben.page, `calendar-item-${cardId}`)).toBeVisible();
  await expect(seen(ben.page, `calendar-item-${cardId}:1`)).toHaveCount(0);

  // Ben stops it from the card: both see it, and the calendar no longer looks ahead.
  await ben.page.goto(`/c/${conversationId}`);
  await theirs.getByTestId('kit-stop-repeating').click();
  await expect(theirs.getByTestId('kit-repeat-stopped')).toBeVisible();
  await expect(mine.getByTestId('kit-repeat-stopped')).toBeVisible();
  await ben.page.goto('/actions?view=calendar');
  await expect(seen(ben.page, `calendar-item-${cardId}`)).toBeVisible();
  await expect(seen(ben.page, `calendar-item-${cardId}:1`)).toHaveCount(0);

  expect([...ana.errors, ...ben.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
});
