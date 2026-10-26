/**
 * A customer calls an organization (M16 H8a, R111 (a)): off until its owner turns it on in its
 * setup; on, the customer's conversation offers a call to the organization, which rings each of
 * the team in that conversation as the organization's ("calling Nile Dental"); the first to answer
 * takes it, the other's ring stops, and the customer's screen names the organization, never who
 * answered (R15).
 */
import { type BrowserContext, expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson } from './helpers';

const stamp = Date.now().toString(36);

/** A connection's last signal on its way as the other hangs up is refused as over (409). */
const late = (e: string) =>
  /^409 POST .*\/v1\/calls\/[0-9a-f-]+\/signal$/.test(e) ||
  e === 'console: Failed to load resource: the server responded with a status of 409 (Conflict)';

test('a customer calls an organization; the first of its team to answer takes it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  const context = async (width: number, height: number) => {
    const c = await browser.newContext({ viewport: { width, height } });
    contexts.push(c);
    return c;
  };
  try {
    const noorContext = await context(1280, 860);
    const saraContext = await context(1280, 860);
    const linaContext = await context(390, 844);
    await apiSignUp(noorContext, 'Noor Haddad', `noor.oc.${stamp}`);
    const saraId = (await apiSignUp(saraContext, 'Sara Ali', `sara.oc.${stamp}`)).id;
    await apiSignUp(linaContext, 'Lina Customer', `lina.oc.${stamp}`);
    const handle = `nile.oc.${stamp}`;
    const made = await noorContext.request.post('/v1/orgs', {
      headers: CLIENT,
      data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
    });
    expect(made.ok(), await made.text()).toBe(true);
    const orgId = ((await made.json()) as { org: { id: string } }).org.id;
    const asked = await noorContext.request.post('/v1/connections/requests', {
      headers: CLIENT,
      data: { toUserId: saraId, relationship: { sphere: 'work', role: 'colleague' } },
    });
    const { requestId } = (await asked.json()) as { requestId: string };
    await saraContext.request.post(`/v1/connections/requests/${requestId}/accept`, {
      headers: CLIENT,
      data: {},
    });
    const seated = await noorContext.request.post(`/v1/orgs/${orgId}/members`, {
      headers: CLIENT,
      data: { userIds: [saraId] },
    });
    expect(seated.ok(), await seated.text()).toBe(true);
    const started = await linaContext.request.post(`/v1/orgs/${orgId}/conversations`, {
      headers: CLIENT,
    });
    expect(started.ok(), await started.text()).toBe(true);
    const convo = ((await started.json()) as { conversationId: string }).conversationId;

    const noor = await newPerson(noorContext);
    const sara = await newPerson(saraContext);
    const lina = await newPerson(linaContext);

    // Off until whoever runs it says so: nothing to call.
    await lina.page.goto(`/c/${convo}`);
    await expect(lina.page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
    await expect(lina.page.getByTestId('call-voice')).toHaveCount(0);

    // The owner turns it on in the setup.
    await noor.page.goto(`/o/${handle}/setup`);
    const allow = noor.page
      .getByTestId('org-calls-from')
      .filter({ visible: true })
      .getByRole('switch');
    await expect(allow).not.toBeChecked();
    await allow.click();
    await expect(allow).toBeChecked();
    await noor.page.screenshot({ path: 'e2e/screenshots/desktop-org-calls-setup.png' });

    // The team waits on their first screens; the customer calls the organization.
    await noor.page.goto('/');
    await sara.page.goto('/');
    await lina.page.reload();
    const video = lina.page.getByTestId('call-video');
    await expect(video).toHaveAccessibleName('Video call Nile Dental');
    await video.click();
    for (const side of [noor, sara]) {
      await expect(side.page.getByTestId('call-incoming')).toBeVisible({ timeout: 20_000 });
      await expect(side.page.getByTestId('call-status')).toHaveText(
        'Video call · calling Nile Dental',
      );
      await expect(side.page.getByTestId('call-screen')).toContainText('Lina Customer');
    }
    await expect(lina.page.getByTestId('call-status')).toHaveText('Calling…');
    await expect(lina.page.getByTestId('call-screen')).toContainText('Nile Dental');
    await sara.page.screenshot({ path: 'e2e/screenshots/desktop-org-call-ringing.png' });

    // Sara answers first: hers, and Noor's ring stops.
    await sara.page.getByTestId('call-accept').click();
    await expect(noor.page.getByTestId('call-screen')).toHaveCount(0, { timeout: 20_000 });
    await expect(lina.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });
    await expect(sara.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/);
    // The customer is in a call with the organization, never with whoever answered.
    const theirs = lina.page.getByTestId('call-screen');
    await expect(theirs).toContainText('Nile Dental');
    await expect(theirs).not.toContainText('Sara');
    // Cai takes no notes in a call with an organization yet: nothing offers it.
    await expect(lina.page.getByTestId('call-notes')).toHaveCount(0);
    await lina.page.screenshot({ path: 'e2e/screenshots/phone-org-call-active.png' });

    await lina.page.getByTestId('call-hangup').click();
    await expect(lina.page.getByTestId('call-screen')).toHaveCount(0);
    await expect(sara.page.getByTestId('call-screen')).toHaveCount(0, { timeout: 20_000 });
    expect([noor, sara, lina].flatMap((s) => s.errors).filter((e) => !late(e))).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
  }
});
