/**
 * The accessibility pass: axe (WCAG 2.2 A and AA, M18 J1) over the primary screens, signed in on a
 * phone and a desktop, in every interface language (English, Arabic right to left, French and
 * Turkish), and over the pages a visitor gets. A serious or critical violation fails; everything
 * found is written to the report, so a regression shows where it is.
 */

import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { DOCX, letterDocx } from '../apps/server/test/office-fixtures';
import { apiSignUp, CLIENT, mailsTo, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

type Found = { screen: string; id: string; impact: string; nodes: number; where: string };

async function audit(page: Page, screen: string, found: Found[]) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page })
    // WCAG 2.2 AA too (M18 J1): axe automates its target-size rule; the rest is checked by hand.
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
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

test('the signed-in screens, phone and desktop, in every interface language', async ({
  browser,
}) => {
  test.setTimeout(480_000);
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
    ['/actions?view=calendar', 'phone calendar'],
    ['/meetings', 'phone meetings'],
    ['/you', 'phone you'],
    [`/o/nile.a11y.${suffix}`, 'phone organization'],
    [`/o/nile.a11y.${suffix}/setup`, 'phone organization setup'],
    [`/o/nile.a11y.${suffix}/inbox?view=bookings`, 'phone business inbox'],
    ['/settings/apps', 'phone apps'],
    ['/settings/cai', 'phone cai'],
    ['/notifications', 'phone notifications'],
    ['/settings/region', 'phone settings'],
  ];
  for (const [path, name] of screens) {
    await page.goto(path);
    await audit(page, name, found);
  }
  // Arabic, right to left: every screen reads the other way; French and Turkish the first few,
  // since a longer word or a different plural is what a language changes on a screen.
  const inLanguage = async (name: string, dir: 'ltr' | 'rtl', count: number, tag: string) => {
    await page.goto('/settings/region');
    await page.getByTestId('region-language-choice').click();
    await page.getByRole('radio', { name }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    for (const [path, screen] of screens.slice(0, count)) {
      await page.goto(path);
      await audit(page, `${screen} (${tag})`, found);
    }
  };
  await inLanguage('العربية', 'rtl', screens.length, 'ar');
  await inLanguage('Français', 'ltr', 4, 'fr');
  await inLanguage('Türkçe', 'ltr', 4, 'tr');
  await inLanguage('English', 'ltr', 0, 'en');
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

test('what a visitor gets: the landing page, the site, entry screens, a person, an organization, a meeting guest’s link, a join link and a file’s link', async ({
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
    ['/marketplace', 'marketplace'],
    ['/marketplace/automation', 'marketplace category'],
    ['/marketplace/zapier', 'marketplace app'],
    ['/marketplace?lang=ar', 'marketplace (ar)'],
    ['/about', 'site about'],
    ['/business?lang=ar', 'site business (ar)'],
    ['/from', 'coming from another app'],
    ['/from/whatsapp?lang=ar', 'coming from WhatsApp (ar)'],
    ['/from/calendly', 'coming from Calendly'],
    ['/sign-in', 'sign-in'],
    ['/sign-up', 'sign-up'],
    [`/@tariq.pub.${suffix}`, 'public person'],
    [`/o/nile.pub.${suffix}`, 'public organization'],
    ['/@cai', 'Cai'],
    ['/@panda?lang=ar', 'a Caime Friend (ar)'],
    ['/nothing-here', 'not found'],
  ] as const) {
    await page.goto(path);
    await audit(page, name, found);
    if (path.startsWith('/@cai') || path.startsWith('/@panda'))
      await page.screenshot({
        path: `e2e/screenshots/phone-public-${path.slice(2).replace(/\?.*$/, '')}.png`,
        fullPage: true,
      });
  }
  await visible(page, /Caime/)
    .first()
    .isVisible()
    .catch(() => false);

  // A meeting guest's link (R84), as the guest opens it: Tariq invites them from a meeting
  // agreed with a connection.
  const other = await browser.newContext();
  const otherUser = await apiSignUp(other, 'Mona Public', `mona.pub.${suffix}`);
  const asked = await maker.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: otherUser.id, relationship: { sphere: 'work', role: 'colleague' } },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  await other.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const direct = (await (
    await maker.request.post('/v1/conversations', {
      headers: CLIENT,
      data: { kind: 'direct', userId: otherUser.id },
    })
  ).json()) as { conversation: { id: string } };
  const card = (await (
    await maker.request.post(`/v1/conversations/${direct.conversation.id}/messages`, {
      headers: CLIENT,
      data: {
        clientId: randomUUID(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Treatment plan',
            start: { at: new Date(Date.now() + 86_400_000).toISOString(), hasTime: true },
            durationMinutes: 30,
          },
        },
      },
    })
  ).json()) as { message: { id: string } };
  await other.request.post(`/v1/messages/${card.message.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  const guest = `guest.pub.${suffix}@example.com`;
  const invited = await maker.request.post(`/v1/messages/${card.message.id}/guests`, {
    headers: CLIENT,
    data: { email: guest, name: 'Sam Guest' },
  });
  expect(invited.ok(), await invited.text()).toBe(true);
  await expect.poll(async () => (await mailsTo(guest)).length).toBe(1);
  const [mail] = await mailsTo(guest);
  const link = /\/j\/cmg_[A-Za-z0-9_-]+/.exec(mail?.text ?? '')?.[0] ?? '';
  for (const [path, name] of [
    [link, 'meeting guest’s link'],
    [`${link}?lang=ar`, 'meeting guest’s link (ar)'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId('join-form')).toBeVisible();
    await audit(page, name, found);
  }

  // A link to join a group (M16 C3e), as someone without an account opens it.
  const circle = (await (
    await maker.request.post('/v1/conversations', {
      headers: CLIENT,
      data: { kind: 'group', title: 'Reading circle' },
    })
  ).json()) as { conversation: { id: string } };
  const joinLink = (await (
    await maker.request.post(`/v1/conversations/${circle.conversation.id}/join-links`, {
      headers: CLIENT,
      data: {},
    })
  ).json()) as { url: string };
  const joinPath = new URL(joinLink.url).pathname;
  for (const [path, name] of [
    [joinPath, 'join link'],
    [`${joinPath}?lang=ar`, 'join link (ar)'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, name, found);
  }
  // A link to one of Tariq's files (M16 H6), as someone without an account opens it.
  const upload = await maker.request.post('/v1/files', {
    headers: CLIENT,
    multipart: {
      file: { name: 'Treatment plan.docx', mimeType: DOCX, buffer: letterDocx() },
    },
  });
  const { file } = (await upload.json()) as { file: { id: string } };
  await maker.request.post(`/v1/conversations/${direct.conversation.id}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), kind: 'file', body: 'The plan', fileIds: [file.id] },
  });
  const fileLink = (await (
    await maker.request.post(`/v1/files/${file.id}/links`, { headers: CLIENT, data: {} })
  ).json()) as { url: string };
  const filePath = new URL(fileLink.url).pathname;
  for (const [path, name] of [
    [filePath, 'file link'],
    [`${filePath}?lang=ar`, 'file link (ar)'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, name, found);
  }
  await other.close();
  expect(report(found)).toEqual([]);
});
