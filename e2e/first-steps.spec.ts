/**
 * First steps that bring others in (M16 C3d): onboarding's "Share your link" sends the person's
 * general invite link, which connects whoever opens it where the bare @handle only finds them,
 * and the same link every time; a browser that can't read contacts offers WhatsApp (and a text,
 * on a phone) first; an iPhone's browser tab, which Safari never notifies, is told once how to
 * be.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

test('onboarding shares the general invite link, one link however often, and it connects', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const leaCtx = await browser.newContext();
  await apiSignUp(leaCtx, 'Lea Share', `lea.share.${suffix}`, { onboarded: false });
  const lea = await newPerson(leaCtx);
  const { page } = lea;
  await page.goto('/onboarding');
  // The link is made as the step shows, before the tap that shares it.
  const made = page.waitForResponse(
    (r) => r.url().endsWith('/v1/invites') && r.request().method() === 'POST',
  );
  await page.getByTestId('onboarding-rules-next').click();
  expect((await made).ok()).toBe(true);
  // A browser without a share sheet copies it, and says so.
  await page.getByTestId('onboarding-share').click();
  await expect(visible(page, 'Link copied')).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/i\/[A-Za-z0-9_-]{16,}$/);
  await page.getByTestId('onboarding-share').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const mine = (await (await leaCtx.request.get('/v1/invites', { headers: CLIENT })).json()) as {
    invites: Array<{ url: string }>;
  };
  expect(mine.invites.map((i) => i.url)).toEqual([url]);

  // From your contacts, on a browser that can't read them: WhatsApp first, with the same link.
  await leaCtx.route('https://wa.me/**', (r) =>
    r.fulfill({ body: 'WhatsApp', contentType: 'text/plain' }),
  );
  await page.getByTestId('onboarding-contacts').click();
  const whatsapp = page.getByTestId('contacts-open-whatsapp');
  await expect(whatsapp).toBeEnabled();
  // A desktop has no messages app to open.
  await expect(page.getByTestId('contacts-open-sms')).toHaveCount(0);
  const opened = leaCtx.waitForEvent('page');
  await whatsapp.click();
  const tab = await opened;
  await tab.waitForLoadState();
  const sent = new URL(tab.url());
  expect(sent.origin + sent.pathname).toBe('https://wa.me/');
  expect(sent.searchParams.get('text')).toBe(`Hi, I’m on Caime. Join me there: ${url}`);
  await tab.close();

  // Whoever opens it is connected, not left to search for a handle.
  const omarCtx = await browser.newContext();
  await apiSignUp(omarCtx, 'Omar Opens', `omar.opens.${suffix}`);
  const token = new URL(url).pathname.split('/')[2] ?? '';
  const took = await omarCtx.request.post(`/v1/invites/${token}/accept`, { headers: CLIENT });
  expect(took.ok(), await took.text()).toBe(true);
  expect(((await took.json()) as { status: string }).status).toBe('connected');

  // A desktop browser notifies in the tab: nothing to tell it about the Home Screen.
  await page.goto('/');
  await expect(page.getByTestId('attention-home')).toBeVisible();
  await expect(page.getByTestId('home-screen-card')).toHaveCount(0);
  expect(lea.errors).toEqual([]);
  await leaCtx.close();
  await omarCtx.close();
});

test('an iPhone’s browser tab is told how to be notified, once', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: IPHONE,
  });
  // Safari in a tab has no push at all: only what's on the Home Screen has it.
  await phone.addInitScript(() => {
    delete (window as { PushManager?: unknown }).PushManager;
  });
  await apiSignUp(phone, 'Ivy Phone', `ivy.phone.${suffix}`);
  const ivy = await newPerson(phone);
  const { page } = ivy;
  await page.goto('/');
  const card = page.getByTestId('home-screen-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Notifications on this iPhone');
  await expect(card).toContainText('Add to Home Screen');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screenshots/phone-home-screen-hint.png' });
  await page.getByTestId('home-screen-later').click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('attention-home').filter({ visible: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  // Nor can an iPhone's browser read contacts: WhatsApp and a text come first.
  await page.goto('/connect?contacts=1');
  await expect(page.getByTestId('contacts-open-whatsapp')).toBeEnabled();
  await expect(page.getByTestId('contacts-open-sms')).toBeEnabled();
  expect(ivy.errors).toEqual([]);
  await phone.close();
});
