/**
 * Join links (M16 C3e): a group made with nobody yet opens on its link; someone new opens it,
 * reads where it leads on a page without the app (never who is in it), signs up through it, and
 * one tap on the last step of onboarding puts them in the group, reading what was said before,
 * while its owner sees them come in. A space's link, from its Add sheet, opened by someone signed
 * in, asks before joining and lands in its General.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT } from './helpers';

test('a group made with nobody brings someone new in through its link', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const owner = await browser.newContext();
  await apiSignUp(owner, 'Noor Haddad', `noor.jl.${suffix}`);
  const page = await owner.newPage();
  const title = `Book club ${suffix}`;
  await page.goto('/new-group');
  await page.getByLabel('Group name').fill(title);
  // Nobody picked: the group is made to be joined by its link.
  const create = page.getByTestId('new-group-create');
  await expect(create).toHaveText('Create, then invite with a link');
  await create.click();
  await page.waitForURL('**/c/**');
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  // It opens on its link, made with one tap, and its people are told a link lets people in.
  await page.getByTestId('join-link-make').filter({ visible: true }).click();
  const link = page.getByTestId('join-link-url').filter({ visible: true });
  await expect(link).toContainText('/g/g_');
  const url = new URL((await link.textContent()) ?? '');
  await expect(page.getByTestId('join-links-open').filter({ visible: true })).toContainText(
    'A link from Noor Haddad',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByText('You made a link to join').filter({ visible: true })).toBeVisible();
  await page.getByTestId('composer-input').fill('First up: Dune, then Middlemarch');
  await page.getByTestId('composer-send').click();
  await expect(
    page.getByText('First up: Dune, then Middlemarch').filter({ visible: true }),
  ).toBeVisible();

  // Someone new: the page says where it leads and how many are in it, without the app or names.
  const fresh = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.41' },
  });
  const visitor = await fresh.newPage();
  await visitor.goto(url.pathname);
  await expect(
    visitor.getByRole('heading', { name: `Noor Haddad invites you to “${title}”` }),
  ).toBeVisible();
  await expect(visitor.getByText('1 person')).toBeVisible();
  await expect(visitor.getByText('Dune')).toHaveCount(0);
  await visitor
    .getByRole('link', { name: `Join “${title}”` })
    .first()
    .click();
  await visitor.waitForURL((u) => u.pathname === '/sign-up');
  await visitor.getByTestId('signup-name').fill('Rana Reader');
  await visitor.getByTestId('signup-handle').fill(`rana.jl.${suffix}`);
  await visitor.getByTestId('signup-email').fill(`rana.jl.${suffix}@example.com`);
  await visitor.getByTestId('signup-password').fill('a long enough passphrase');
  await visitor.getByTestId('signup-birth-date').fill('1992-03-08');
  await expect(visitor.getByText('Available')).toBeVisible();
  await visitor.getByTestId('signup-submit').click();
  await visitor.waitForURL('**/onboarding');
  const join = visitor.getByTestId('onboarding-link');
  await expect(join).toHaveText(`Join “${title}”`);
  await join.click();

  // In it, in one tap, reading what was said before they came.
  await visitor.waitForURL((u) => u.pathname === `/c/${id}`);
  await expect(
    visitor.getByText('First up: Dune, then Middlemarch').filter({ visible: true }),
  ).toBeVisible();
  // Its owner sees them come in, without a reload (the line, the list's row and the live region
  // for a screen reader all say so).
  await expect(
    page.getByText('Rana Reader joined').filter({ visible: true }).first(),
  ).toBeVisible();
  await fresh.close();
  await owner.close();
});

test('a space’s link, opened signed in, asks first and lands in its General', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const owner = await browser.newContext();
  await apiSignUp(owner, 'Omar Farouk', `omar.jl.${suffix}`);
  const made = await owner.request.post('/v1/spaces', {
    headers: CLIENT,
    data: { name: `Running club ${suffix}`, kind: 'community' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const { space } = (await made.json()) as { space: { id: string; generalId: string } };

  // Its Add sheet offers the link to whoever runs it.
  const page = await owner.newPage();
  await page.goto(`/s/${space.id}`);
  await page.getByTestId('space-add-people').filter({ visible: true }).click();
  await page.getByTestId('join-link-make').filter({ visible: true }).click();
  const link = page.getByTestId('join-link-url').filter({ visible: true });
  await expect(link).toContainText('/g/g_');
  const url = new URL((await link.textContent()) ?? '');
  await page.keyboard.press('Escape');

  // Someone already on Caime opens it: where it leads, and Join, which they press.
  const other = await browser.newContext();
  await apiSignUp(other, 'Sam Runner', `sam.jl.${suffix}`);
  const runner = await other.newPage();
  await runner.goto(url.pathname);
  await expect(runner.getByTestId('join-link')).toContainText(
    `Omar Farouk invites you to “Running club ${suffix}”`,
  );
  await expect(runner.getByTestId('join-link')).toContainText('Community');
  await runner.getByTestId('join-link-join').click();
  await runner.waitForURL((u) => u.pathname === `/c/${space.generalId}`);
  // Opened again, it says they're in it, and opens it.
  await runner.goto(url.pathname);
  await expect(runner.getByText(`You’re in “Running club ${suffix}” already.`)).toBeVisible();
  await runner.getByTestId('join-link-open').click();
  await runner.waitForURL((u) => u.pathname === `/c/${space.generalId}`);
  const members = await owner.request.get(`/v1/spaces/${space.id}`, { headers: CLIENT });
  const view = (await members.json()) as { space: { members: Array<{ role: string }> } };
  expect(view.space.members.map((m) => m.role).sort()).toEqual(['member', 'owner']);
  await other.close();
  await owner.close();
});
