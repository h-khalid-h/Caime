/**
 * Meetings (R83): Join on an accepted meeting's card opens its call; the other side's Join, from
 * the address the calendar and calendar apps use, answers the call already ringing rather than
 * placing a second; Meetings lists it with its Join. A guest (R84) invited by address from the
 * card joins from their own link, without an account, and is in the meeting's call.
 */
import { randomUUID } from 'node:crypto';
import { type Browser, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, newPerson } from './helpers';

/** Ana and Ben, connected, and a meeting held here starting in two minutes, accepted by Ben. */
async function agreedMeeting(browser: Browser, title: string) {
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

  // Nothing Gus's page asked for was refused (the server allows a guest only their meeting).
  expect([...ana.errors, ...gus.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
  await gusCtx.close();
});
