/**
 * Onto a verified organization's team by an address at its domain (M16 C3b): its owner turns it
 * on from the setup screen once the domain is verified; someone new who signed up with an address
 * there and confirmed it finds "Join Nile Dental's team" on its page, and one tap puts them in its
 * Business inbox.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, PASSWORD, publishTxt } from './helpers';

test('someone with a confirmed address at its domain joins its team in one tap', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const domain = `nile-${suffix}.example`;
  const handle = `nile.dj.${suffix}`;
  const owner = await browser.newContext();
  await apiSignUp(owner, 'Noor Haddad', `noor.dj.${suffix}`);
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const { org } = (await made.json()) as { org: { id: string } };
  const set = await owner.request.put(`/v1/orgs/${org.id}/domain`, {
    headers: CLIENT,
    data: { domain },
  });
  const { record } = ((await set.json()) as { org: { domain: { record: { value: string } } } }).org
    .domain;
  await publishTxt(`_caime-verify.${domain}`, [record.value]);
  const checked = await owner.request.post(`/v1/orgs/${org.id}/domain/check`, { headers: CLIENT });
  expect(checked.ok(), await checked.text()).toBe(true);

  // Its owner lets staff in by their address, from the setup screen.
  const page = await owner.newPage();
  await page.goto(`/o/${handle}/setup`);
  // The switch's checkbox sits inside the element that carries the test id.
  const allow = page
    .getByTestId('org-join-by-domain')
    .filter({ visible: true })
    .getByRole('switch');
  await expect(allow).not.toBeChecked();
  await allow.click();
  await expect(allow).toBeChecked();

  // Someone new signs up with an address there, and confirms it with its code.
  const staff = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.52' },
  });
  const email = `rana@${domain}`;
  const signedUp = await staff.request.post('/v1/auth/signup', {
    headers: CLIENT,
    data: {
      email,
      password: PASSWORD,
      displayName: 'Rana Staff',
      handle: `rana.dj.${suffix}`,
      birthDate: '1992-03-08',
      country: 'EG',
      timeZone: 'UTC',
      client: 'web',
    },
  });
  expect(signedUp.ok(), await signedUp.text()).toBe(true);
  await staff.request.patch('/v1/me', { headers: CLIENT, data: { onboarded: true } });
  await expect.poll(async () => (await mailsTo(email)).length).toBeGreaterThan(0);
  const code = /is (\d{6})/.exec((await mailsTo(email)).at(-1)?.text ?? '')?.[1] ?? '';
  const confirmed = await staff.request.post('/v1/auth/email/verify', {
    headers: CLIENT,
    data: { code },
  });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);

  // Its page offers the team; one tap, and they're in its inbox.
  const visitor = await staff.newPage();
  await visitor.goto(`/o/${handle}`);
  const offer = visitor.getByTestId('org-join-team').filter({ visible: true });
  await expect(offer).toContainText('Join Nile Dental’s team');
  await expect(offer).toContainText(`Your address ${email} lets you in`);
  await visitor.getByTestId('org-join-team-button').filter({ visible: true }).click();
  await visitor.waitForURL((u) => u.pathname === `/o/${handle}/inbox`);

  // On the team now, as the owner reads it.
  const team = await owner.request.get(`/v1/orgs/by-handle/${handle}`, { headers: CLIENT });
  const view = (await team.json()) as {
    org: { members: Array<{ person: { displayName: string }; role: string }> };
  };
  expect(view.org.members.find((m) => m.person.displayName === 'Rana Staff')?.role).toBe('agent');
  await staff.close();
  await owner.close();
});
