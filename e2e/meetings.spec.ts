/**
 * Meetings (R83): Join on an accepted meeting's card opens its call; the other side's Join, from
 * the address the calendar and calendar apps use (its short one, M16 F6d), answers the call
 * already ringing rather than placing a second; Meetings lists it with its Join. A guest (R84) invited by address from the
 * card joins from their own link, without an account, and is in the meeting's call, writing in
 * its chat while it's on (M17 I13j). A meeting
 * that repeats (R58) is agreed once, until a day if it's given one; the calendar has each time
 * ahead until it's stopped. Either side suggests another time from the card (M16 F5), which asks
 * the other side, in a line that says so, until they answer.
 */
import { randomUUID } from 'node:crypto';
import { type Browser, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, newPerson, visible } from './helpers';

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

  // Ben joins from the meeting's address as his calendar app has it (M16 F6d: its short one, read
  // from his calendar feed): the ringing call is answered, not met with a second one.
  const feed = await benCtx.request.post('/v1/calendar/feed', { headers: CLIENT });
  expect(feed.ok(), await feed.text()).toBe(true);
  const { url } = (await feed.json()) as { url: string };
  const ics = (await (await benCtx.request.get(url)).text()).replace(/\r\n /g, '');
  const short = /\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.exec(ics)?.[0] ?? '';
  expect(short).not.toBe('');
  expect(ics).not.toContain(`/c/${conversationId}?seq=`);
  await ben.page.goto(short);
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

  // Gus writes while the call is on (M17 I13j): Chat makes the call small over Gus's page, whose
  // chat takes words while Gus is in it.
  await gus.page.getByTestId('group-call-chat').click();
  await expect(gus.page.getByTestId('call-tile')).toBeVisible();
  await gus.page.getByTestId('guest-chat-input').fill('The address is 12 Nile Street');
  await gus.page.getByTestId('guest-chat-send').click();
  await expect(gus.page.getByTestId('guest-chat-input')).toHaveValue('');
  await expect(
    gus.page.getByTestId('guest-chat-line').filter({ hasText: '12 Nile Street' }),
  ).toContainText('Guest');
  // Ana, with the call filling the screen, sees it over the call, and in the chat it's a guest's.
  await expect(ana.page.getByTestId('call-chat-peek')).toContainText('12 Nile Street', {
    timeout: 15_000,
  });
  await ana.page.getByTestId('group-call-chat').click();
  // Read out as the guest's: who, that they're a guest, then the words.
  const line = ana.page
    .getByLabel(/Guest, The address is 12 Nile Street/)
    .filter({ visible: true });
  await expect(line.getByTestId('message-guest')).toBeVisible();
  await ana.page.getByTestId('call-tile-back').click();

  // Ana leaves while Gus is still in it; Gus goes on to another address with the call left behind.
  await ana.page.getByTestId('group-call-leave').click();

  // Anywhere else Gus goes is their meeting: none of the app is theirs.
  await gus.page.goto('/');
  await expect(gus.page).toHaveURL(new RegExp(link.replace(/[/]/g, '\\/')));
  await expect(gus.page.getByTestId('guest-meeting')).toBeVisible();
  // Out of the call, the chat reads as it was and takes nothing more.
  await expect(gus.page.getByTestId('guest-chat')).toContainText('12 Nile Street');
  await expect(gus.page.getByTestId('guest-chat-later')).toBeVisible();
  await expect(gus.page.getByTestId('guest-chat-input')).toHaveCount(0);

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

test('a guest by link: the inviter sends it themselves, and its holder joins the meeting', async ({
  browser,
}) => {
  const { anaCtx, benCtx, ana, conversationId } = await agreedMeeting(browser, 'Link review');

  // Ana makes a link for Lina from the card: shown once, to send however she likes.
  await ana.page.goto(`/c/${conversationId}`);
  const original = ana.page.getByTestId('kit-meeting').filter({ hasText: 'Link review' });
  await original.getByTestId('kit-invite').click();
  await ana.page.getByTestId('guest-name').fill('Lina Link');
  await ana.page.getByTestId('guest-make-link').click();
  const shown = ana.page.getByTestId('guest-link');
  await expect(shown).toContainText('/j/cmg_');
  const link = new URL((await shown.textContent()) ?? '').pathname;
  await ana.page.getByTestId('guest-link-done').click();
  // The meeting moved to its own space, which opens.
  await expect(ana.page).not.toHaveURL(new RegExp(conversationId));
  await expect(
    ana.page.getByTestId('kit-meeting').filter({ hasText: 'Link review' }),
  ).toBeVisible();

  // Lina, in a browser with nothing of Caime: the name Ana gave, the age, Join.
  const linaCtx = await browser.newContext();
  const lina = await newPerson(linaCtx);
  await lina.page.goto(link);
  await expect(lina.page.getByTestId('join-form')).toBeVisible();
  await expect(lina.page.getByTestId('join-form')).toContainText('Ana Meet');
  await expect(lina.page.getByTestId('join-name')).toHaveValue('Lina Link');
  await lina.page.getByTestId('join-adult').getByRole('switch').click();
  await lina.page.getByTestId('join-submit').click();
  // Lina is in the meeting's own space: its title, who's in it, the call.
  const meeting = lina.page.getByTestId('guest-meeting');
  await expect(meeting).toBeVisible();
  await expect(lina.page.getByText('Link review').first()).toBeVisible();
  await expect(meeting).toContainText('Ana Meet');
  await expect(meeting).toContainText('Ben Meet');
  expect([...ana.errors, ...lina.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
  await linaCtx.close();
});

test('a guest by link keeps the meeting as their own account, and lands in it (C3f)', async ({
  browser,
}) => {
  const { anaCtx, benCtx, card, tag } = await agreedMeeting(browser, 'Budget review');
  // Ana makes Gus's link (the card's sheet is the test above's), and says something in the space.
  const made = await anaCtx.request.post(`/v1/messages/${card.id}/guests`, {
    headers: CLIENT,
    data: { link: true, name: 'Gus Keep' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const { link, space } = (await made.json()) as {
    link: string;
    space: { conversationId: string };
  };
  const said = await anaCtx.request.post(`/v1/conversations/${space.conversationId}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), kind: 'text', body: 'Slides are in the folder.' },
  });
  expect(said.ok(), await said.text()).toBe(true);
  const people = async () =>
    (
      (await (
        await anaCtx.request.get(`/v1/conversations/${space.conversationId}`, { headers: CLIENT })
      ).json()) as {
        conversation: { participants: Array<{ userId: string; person: { displayName: string } }> };
      }
    ).conversation.participants;
  const guestId = (await people()).find((p) => p.person.displayName === 'Gus Keep')?.userId;

  // Gus joins as a guest, and keeps it from the meeting's own page.
  const gusCtx = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.61' },
  });
  const gus = await newPerson(gusCtx);
  await gus.page.goto(new URL(link).pathname);
  await gus.page.getByTestId('join-adult').getByRole('switch').click();
  await gus.page.getByTestId('join-submit').click();
  await expect(gus.page.getByTestId('guest-keep')).toContainText('Keep this meeting');
  await gus.page.getByTestId('guest-keep-button').click();

  // Sign-up already knows who they are and what they keep: a handle, an address, a password.
  await gus.page.waitForURL((u) => u.pathname === '/sign-up');
  await expect(gus.page.getByText('Keep “Budget review”')).toBeVisible();
  await expect(gus.page.getByTestId('signup-name')).toHaveValue('Gus Keep');
  const handle = `gus_keep_${tag}`;
  await gus.page.getByTestId('signup-handle').fill(handle);
  await gus.page.getByTestId('signup-email').fill(`gus.keep.${tag}@example.com`);
  await gus.page.getByTestId('signup-password').fill('a long enough passphrase');
  await gus.page.getByTestId('signup-birth-date').fill('1991-04-02');
  await expect(gus.page.getByText('Available')).toBeVisible();
  await gus.page.getByTestId('signup-submit').click();

  // The last step opens the meeting, theirs now, with what was said before they kept it.
  await gus.page.waitForURL('**/onboarding');
  const open = gus.page.getByTestId('onboarding-link');
  await expect(open).toHaveText('Open “Budget review”');
  await open.click();
  await gus.page.waitForURL((u) => u.pathname === `/c/${space.conversationId}`);
  await expect(visible(gus.page, 'Slides are in the folder.')).toBeVisible();
  // The same person the meeting knew, an account now, and nobody twice.
  const me = (await (await gusCtx.request.get('/v1/me', { headers: CLIENT })).json()) as {
    user: { id: string; handle: string };
  };
  expect(me.user).toMatchObject({ id: guestId, handle });
  expect(await people()).toHaveLength(3);
  expect([...gus.errors]).toEqual([]);
  await gusCtx.close();
  await anaCtx.close();
  await benCtx.close();
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

test('another time is suggested from the card, and the other side agrees to it (M16 F5)', async ({
  browser,
}) => {
  const { anaCtx, benCtx, ana, ben, conversationId } = await colleagues(browser);
  // Ana's meeting three days on, which Ben accepted.
  const sent = await anaCtx.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Review the plan',
          start: { at: new Date(Date.now() + 3 * 86_400_000).toISOString(), hasTime: true },
          durationMinutes: 30,
        },
      },
    },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const card = ((await sent.json()) as { message: { id: string } }).message;
  const accepted = await benCtx.request.post(`/v1/messages/${card.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);

  // Ben can't make it then: he suggests tomorrow from the card.
  await ben.page.goto(`/c/${conversationId}`);
  const theirs = ben.page
    .getByTestId('kit-meeting')
    .filter({ hasText: 'Review the plan', visible: true });
  await expect(theirs).toContainText('Accepted');
  await theirs.getByTestId('kit-another-time').click();
  await ben.page.getByRole('radio', { name: /^Tomorrow/ }).click();
  await ben.page.getByTestId('kit-another-time-sheet-done').click();
  await expect(theirs).toContainText('Proposed');
  await expect(visible(ben.page, 'You suggested another time for “Review the plan”')).toBeVisible();
  // It's Ana's to answer now: Ben can only take it back.
  await expect(theirs.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);

  // Ana reads the line that asks her, and agrees to the new time.
  await ana.page.goto(`/c/${conversationId}`);
  await expect(
    visible(ana.page, 'Ben Meet suggested another time for “Review the plan”'),
  ).toBeVisible();
  const mine = ana.page
    .getByTestId('kit-meeting')
    .filter({ hasText: 'Review the plan', visible: true });
  await mine.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(mine).toContainText('Accepted');
  await expect(theirs).toContainText('Accepted');

  expect([...ana.errors, ...ben.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
});
