/**
 * The dark pass (docs/REVIEW-2026-10.md, P2): the primary screens photographed in the dark
 * scheme on a phone and a desktop, so a regression in dark shows in the screenshots, and the
 * scheme is the device's (prefers-color-scheme) with nothing chosen in the app.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('the primary screens in the dark scheme, on a phone and a desktop', async ({ browser }) => {
  test.setTimeout(240_000);
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const noor = await apiSignUp(phone, 'Noor Dark', `noor.dark.${suffix}`);
  await apiSignUp(other, 'Tariq Hassan', `tariq.dark.${suffix}`);
  const asked = await other.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: {
      toUserId: noor.id,
      relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
    },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const acc = await phone.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const convo = ((await acc.json()) as { conversationId: string }).conversationId;
  for (const body of [
    'Hi Noor! Can we meet on Thursday at 10?',
    'I will send the contract tomorrow.',
  ]) {
    await other.request.post(`/v1/conversations/${convo}/messages`, {
      headers: CLIENT,
      data: { clientId: crypto.randomUUID(), kind: 'text', body },
    });
  }
  await phone.request.post(`/v1/conversations/${convo}/messages`, {
    headers: CLIENT,
    data: { clientId: crypto.randomUUID(), kind: 'text', body: 'Thursday works. See you at 10!' },
  });
  const org = await phone.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle: `nile.dark.${suffix}`, kind: 'clinic' },
  });
  const orgId = ((await org.json()) as { org: { id: string } }).org.id;
  const cust = await other.request.post(`/v1/orgs/${orgId}/conversations`, { headers: CLIENT });
  const custConvo = ((await cust.json()) as { conversationId: string }).conversationId;
  await other.request.post(`/v1/conversations/${custConvo}/messages`, {
    headers: CLIENT,
    data: {
      clientId: crypto.randomUUID(),
      kind: 'text',
      body: 'Do you take insurance? I would like a cleaning next week.',
    },
  });
  const { page, errors } = await newPerson(phone);
  const shot = async (p: import('@playwright/test').Page, path: string, name: string) => {
    await p.goto(path);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `e2e/screenshots/dark-${name}.png`, animations: 'disabled' });
  };
  // The device's scheme is followed: the page paints dark before anything is chosen.
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .not.toBe('rgb(255, 255, 255)');
  await shot(page, '/', 'phone-chats');
  await shot(page, `/c/${convo}`, 'phone-conversation');
  await shot(page, `/@tariq.dark.${suffix}`, 'phone-person');
  await shot(page, '/you', 'phone-you');
  await shot(page, `/o/nile.dark.${suffix}`, 'phone-org');
  await shot(page, '/actions', 'phone-actions');
  const desk = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    storageState: await phone.storageState(),
  });
  const { page: d, errors: dErrors } = await newPerson(desk);
  await shot(d, `/c/${convo}`, 'desk-conversation');
  await shot(d, `/o/nile.dark.${suffix}/inbox`, 'desk-business');
  await shot(d, '/settings/notifications', 'desk-notifications');
  await shot(d, '/people', 'desk-people');
  expect(errors).toEqual([]);
  expect(dErrors).toEqual([]);
  await desk.close();
  await phone.close();
  await other.close();
});
