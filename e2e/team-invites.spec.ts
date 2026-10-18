/**
 * Team invites (M16 C3a): the owner makes a link from the team's Add sheet; someone new opens
 * it, reads whose team it is on a page without the app, signs up through it, and one tap on
 * the last step of onboarding puts them on the team and in its Business inbox, while the
 * owner's page shows them on the team without a reload.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT } from './helpers';

test('someone new joins a team through its link and lands in its inbox', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const owner = await browser.newContext();
  await apiSignUp(owner, 'Noor Haddad', `noor.ti.${suffix}`);
  const handle = `nile.ti.${suffix}`;
  const made = await owner.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);

  // The team's Add sheet: a link to share, made with one tap.
  const page = await owner.newPage();
  await page.goto(`/o/${handle}`);
  await page.getByTestId('org-add-people').filter({ visible: true }).click();
  await page.getByTestId('team-invite-make').filter({ visible: true }).click();
  const link = page.getByTestId('team-invite-link').filter({ visible: true });
  await expect(link).toContainText('/t/t_');
  const url = new URL((await link.textContent()) ?? '');
  await expect(page.getByTestId('team-invites-open').filter({ visible: true })).toContainText(
    'A link to share',
  );
  await page.keyboard.press('Escape');

  // Someone new: the page says whose team, without the app; the way in carries the link.
  const staff = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.31' },
  });
  const visitor = await staff.newPage();
  await visitor.goto(url.pathname);
  await expect(
    visitor.getByRole('heading', { name: 'Noor Haddad invites you to Nile Dental’s team' }),
  ).toBeVisible();
  await visitor.getByRole('link', { name: 'Join Nile Dental’s team' }).first().click();
  await visitor.waitForURL((u) => u.pathname === '/sign-up');
  await visitor.getByTestId('signup-name').fill('Rana Staff');
  await visitor.getByTestId('signup-handle').fill(`rana.ti.${suffix}`);
  await visitor.getByTestId('signup-email').fill(`rana.ti.${suffix}@example.com`);
  await visitor.getByTestId('signup-password').fill('a long enough passphrase');
  await visitor.getByTestId('signup-birth-date').fill('1992-03-08');
  await expect(visitor.getByText('Available')).toBeVisible();
  await visitor.getByTestId('signup-submit').click();
  await visitor.waitForURL('**/onboarding');
  const join = visitor.getByTestId('onboarding-link');
  await expect(join).toHaveText('Join Nile Dental’s team');
  await join.click();
  await visitor.waitForURL((u) => u.pathname === `/o/${handle}/inbox`);

  // On the team now, as its page says to whoever runs it, without a reload.
  await expect(page.getByText('Rana Staff').filter({ visible: true }).first()).toBeVisible();
  const team = await owner.request.get(`/v1/orgs/by-handle/${handle}`, { headers: CLIENT });
  const org = (await team.json()) as {
    org: { members: Array<{ person: { displayName: string }; role: string }> };
  };
  expect(org.org.members.find((m) => m.person.displayName === 'Rana Staff')?.role).toBe('agent');
  await staff.close();
  await owner.close();
});
