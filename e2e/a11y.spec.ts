/**
 * The accessibility pass: axe (WCAG 2.1 A and AA) over the primary screens, signed in on a
 * phone and a desktop, in English and in Arabic, and over the pages a visitor gets. A serious
 * or critical violation fails; everything found is written to the report, so a regression
 * shows where it is.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

type Found = { screen: string; id: string; impact: string; nodes: number; where: string };

async function audit(page: Page, screen: string, found: Found[]) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const v of results.violations)
    found.push({
      screen,
      id: v.id,
      impact: v.impact ?? 'minor',
      nodes: v.nodes.length,
      where: v.nodes[0]?.target.join(' ') ?? '',
    });
}

function report(found: Found[]) {
  const lines = found.map(
    (f) =>
      `${f.impact.padEnd(8)} ${f.id.padEnd(28)} ×${String(f.nodes).padEnd(3)} ${f.screen}  ${f.where}`,
  );
  test.info().annotations.push({ type: 'axe', description: lines.join('\n') || 'nothing found' });
  console.log(lines.join('\n') || 'axe: nothing found');
  return found.filter((f) => f.impact === 'serious' || f.impact === 'critical');
}

test('the signed-in screens, phone and desktop, English and Arabic', async ({ browser }) => {
  test.setTimeout(300_000);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const noor = await apiSignUp(phone, 'Noor Access', `noor.a11y.${suffix}`);
  await apiSignUp(other, 'Tariq Hassan', `tariq.a11y.${suffix}`);
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
  ])
    await other.request.post(`/v1/conversations/${convo}/messages`, {
      headers: CLIENT,
      data: { clientId: crypto.randomUUID(), kind: 'text', body },
    });
  await phone.request.post(`/v1/conversations/${convo}/messages`, {
    headers: CLIENT,
    data: { clientId: crypto.randomUUID(), kind: 'text', body: 'Thursday works. See you at 10!' },
  });
  const org = await phone.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle: `nile.a11y.${suffix}`, kind: 'clinic' },
  });
  const orgId = ((await org.json()) as { org: { id: string } }).org.id;
  const cust = await other.request.post(`/v1/orgs/${orgId}/conversations`, { headers: CLIENT });
  const custConvo = ((await cust.json()) as { conversationId: string }).conversationId;
  await other.request.post(`/v1/conversations/${custConvo}/messages`, {
    headers: CLIENT,
    data: { clientId: crypto.randomUUID(), kind: 'text', body: 'Do you take insurance?' },
  });

  const found: Found[] = [];
  const { page, errors } = await newPerson(phone);
  const screens: Array<[string, string]> = [
    ['/', 'phone attention'],
    ['/chats', 'phone chats'],
    [`/c/${convo}`, 'phone conversation'],
    [`/@tariq.a11y.${suffix}`, 'phone person'],
    ['/people', 'phone people'],
    ['/actions', 'phone actions'],
    ['/you', 'phone you'],
    [`/o/nile.a11y.${suffix}`, 'phone organization'],
    [`/o/nile.a11y.${suffix}/setup`, 'phone organization setup'],
    ['/settings/region', 'phone settings'],
  ];
  for (const [path, name] of screens) {
    await page.goto(path);
    await audit(page, name, found);
  }
  // Arabic, right to left: the same screens read the other way.
  await page.goto('/settings/region');
  await page.getByRole('radio', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const [path, name] of screens.slice(0, 3)) {
    await page.goto(path);
    await audit(page, `${name} (ar)`, found);
  }
  // The keyboard reaches a message's actions (R20): focus shows them beside the bubble, Enter
  // opens them all.
  await page.goto(`/c/${convo}`);
  const bubble = page.getByLabel(/I will send the contract tomorrow/).first();
  await bubble.focus();
  await expect(
    page
      .getByRole('button', { name: /^(Reply|رد)$/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('message-copy')).toBeVisible();
  // And Escape closes the sheet, as any dialog's does.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('message-copy')).toBeHidden();
  await page.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await apiSignUp(desk, 'Dana Desk', `dana.a11y.${suffix}`);
  const d = await newPerson(desk);
  for (const [path, name] of [
    ['/', 'desktop attention'],
    ['/chats', 'desktop chats'],
    ['/people', 'desktop people'],
    ['/you', 'desktop you'],
  ] as const) {
    await d.page.goto(path);
    await audit(d.page, name, found);
  }
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  expect(report(found)).toEqual([]);
});

test('what a visitor gets: the landing page, the site, entry screens, a person and an organization', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const maker = await browser.newContext();
  await apiSignUp(maker, 'Tariq Public', `tariq.pub.${suffix}`);
  const org = await maker.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle: `nile.pub.${suffix}`, kind: 'clinic' },
  });
  expect(org.ok()).toBe(true);
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await visitor.newPage();
  const found: Found[] = [];
  for (const [path, name] of [
    ['/', 'landing'],
    ['/business', 'site business'],
    ['/pricing', 'site pricing'],
    ['/security', 'site security'],
    ['/developers', 'site developers'],
    ['/about', 'site about'],
    ['/business?lang=ar', 'site business (ar)'],
    ['/sign-in', 'sign-in'],
    ['/sign-up', 'sign-up'],
    [`/@tariq.pub.${suffix}`, 'public person'],
    [`/o/nile.pub.${suffix}`, 'public organization'],
    ['/nothing-here', 'not found'],
  ] as const) {
    await page.goto(path);
    await audit(page, name, found);
  }
  await visible(page, /Caime/)
    .first()
    .isVisible()
    .catch(() => false);
  expect(report(found)).toEqual([]);
});
