/**
 * A meeting that changes, and everyone's own answer (R123), as the owner met it: a space, a group
 * in it with two people, a weekly meeting proposed there and accepted by one of the two. Its
 * organizer changes its title and day from the card's Edit, "this and every time after"; that
 * asks everyone again; each person answers for themselves, Going or Not going; and the meeting
 * is at the top of the conversation for everyone, without scrolling.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

test('a group’s weekly meeting is changed by its organizer and answered by each', async ({
  browser,
}) => {
  const tag = randomUUID().slice(0, 6);
  const hassanCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const saraCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const omarCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const hassan = await newPerson(hassanCtx);
  const sara = await newPerson(saraCtx);
  const omar = await newPerson(omarCtx);
  await apiSignUp(hassanCtx, 'Hassan Weekly', `hassan_wk_${tag}`);
  const saraUser = await apiSignUp(saraCtx, 'Sara Weekly', `sara_wk_${tag}`);
  const omarUser = await apiSignUp(omarCtx, 'Omar Weekly', `omar_wk_${tag}`);
  for (const [ctx, user] of [
    [saraCtx, saraUser],
    [omarCtx, omarUser],
  ] as const) {
    const asked = await hassanCtx.request.post('/v1/connections/requests', {
      headers: CLIENT,
      data: { toUserId: user.id, relationship: { sphere: 'work', role: 'colleague' } },
    });
    expect(asked.ok(), await asked.text()).toBe(true);
    const { requestId } = (await asked.json()) as { requestId: string };
    const took = await ctx.request.post(`/v1/connections/requests/${requestId}/accept`, {
      headers: CLIENT,
      data: {},
    });
    expect(took.ok(), await took.text()).toBe(true);
  }
  // A space, and a group within it that has the two of them.
  const made = await hassanCtx.request.post('/v1/spaces', {
    headers: CLIENT,
    data: { name: 'Project', kind: 'team', memberIds: [saraUser.id, omarUser.id] },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const space = ((await made.json()) as { space: { id: string } }).space;
  const opened = await hassanCtx.request.post(`/v1/spaces/${space.id}/conversations`, {
    headers: CLIENT,
    data: { title: 'Planning' },
  });
  const group = ((await opened.json()) as { conversation: { id: string } }).conversation.id;
  const added = await hassanCtx.request.post(`/v1/conversations/${group}/members`, {
    headers: CLIENT,
    data: { userIds: [saraUser.id, omarUser.id] },
  });
  expect(added.ok(), await added.text()).toBe(true);
  // A weekly meeting three days on, at 10:00 UTC (their clocks are UTC here), accepted by Sara.
  const day = new Date(Date.now() + 3 * 86_400_000);
  day.setUTCHours(10, 0, 0, 0);
  const sent = await hassanCtx.request.post(`/v1/conversations/${group}/messages`, {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Weekly sync',
          start: { at: day.toISOString(), hasTime: true },
          durationMinutes: 60,
          repeat: 'week',
        },
      },
    },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const card = ((await sent.json()) as { message: { id: string } }).message;
  const accepted = await saraCtx.request.post(`/v1/messages/${card.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);

  // Everyone sees the meeting at the top of the conversation, without scrolling for it.
  await hassan.page.goto(`/c/${group}`);
  const top = hassan.page.getByTestId('next-card').filter({ visible: true });
  await expect(top).toContainText('Weekly sync');
  // Its organizer and Sara.
  await expect(top).toContainText('2 going');

  // Its organizer edits it: a new name and a new day, for this time and every time after.
  const mine = hassan.page.getByTestId('kit-meeting').filter({ hasText: 'Weekly sync' });
  await mine.getByTestId('kit-edit').click();
  await expect(visible(hassan.page, 'Change the meeting')).toBeVisible();
  await expect(hassan.page.getByTestId('kit-scope-this')).toBeChecked();
  await hassan.page.getByTestId('kit-scope-after').click();
  await hassan.page.getByLabel('Title').fill('Team sync');
  const later = new Date(day.getTime() + 86_400_000);
  const weekday = later.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  await hassan.page.getByLabel('When', { exact: true }).fill(`${weekday} 4pm`);
  await hassan.page.getByTestId('kit-send').click();
  const changed = hassan.page.getByTestId('kit-meeting').filter({ hasText: 'Team sync' });
  // A new time asks everyone again: back to asking, until someone says yes.
  await expect(changed).toContainText('Proposed');
  await expect(top).toContainText('Team sync');
  await expect(top).toContainText('1 going');

  // Sara, on her phone, sees it asked again at the top, and says she's going.
  await sara.page.goto(`/c/${group}`);
  const saraTop = sara.page.getByTestId('next-card').filter({ visible: true });
  await expect(saraTop).toContainText('Team sync');
  const hers = sara.page.getByTestId('kit-meeting').filter({ hasText: 'Team sync', visible: true });
  // The line where everyone looks says what changed: its organizer moved it.
  await expect(visible(sara.page, 'Hassan Weekly moved “Team sync”')).toBeVisible();
  // No Cancel or Stop repeating for her: only its organizer changes it. She answers for herself.
  await expect(hers.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(hers.getByTestId('kit-stop-repeating')).toHaveCount(0);
  await hers.getByTestId('kit-going').click();
  await expect(hers.getByTestId('kit-going')).toHaveAttribute('aria-pressed', 'true');
  await expect(hers).toContainText('Accepted');
  // The top line counts her with its organizer.
  await expect(saraTop).toContainText('2 going');

  // Omar can't come: his own answer, and the line at his top says so.
  await omar.page.goto(`/c/${group}`);
  const his = omar.page.getByTestId('kit-meeting').filter({ hasText: 'Team sync', visible: true });
  await his.getByTestId('kit-not-going').click();
  await expect(his.getByTestId('kit-not-going')).toHaveAttribute('aria-pressed', 'true');
  await expect(omar.page.getByTestId('next-card').filter({ visible: true })).toContainText(
    'You’re not going',
  );

  // Its organizer sees who's coming: themself and Sara; Omar isn't.
  await expect(changed.getByTestId('kit-answers')).toContainText('2 going · 1 not going');
  await changed.getByTestId('kit-answers').click();
  const sheet = hassan.page.getByTestId('kit-answers-sheet');
  await expect(sheet).toContainText('Sara Weekly');
  await expect(sheet).toContainText('Omar Weekly');
  await hassan.page.screenshot({ path: 'e2e/screenshots/desktop-meeting-answers.png' });
  await sara.page.screenshot({ path: 'e2e/screenshots/phone-meeting-answers.png' });

  for (const who of [hassan, sara, omar]) expect(who.errors).toEqual([]);
  await hassanCtx.close();
  await saraCtx.close();
  await omarCtx.close();
});
