/**
 * Link previews (M16 E4c): a link being written shows its page's card above the composer; sent,
 * the card is in both people's bubbles, its picture served by Caime; a card taken off before
 * sending stays off. The site is asked by Caime's server alone, once for the page and once for
 * its picture, never by either person's browser.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, WEB_STUB } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('a link’s card is read once by the server, shown before sending, and taken off on request', async ({
  browser,
}) => {
  const linaCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const omarCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const before = ((await (await linaCtx.request.get(`${WEB_STUB}/requests`)).json()) as unknown[])
    .length;
  await apiSignUp(linaCtx, 'Lina Links', `lina.links.${suffix}`);
  const omar = await apiSignUp(omarCtx, 'Omar Links', `omar.links.${suffix}`);
  const asked = await linaCtx.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: omar.id, relationship: { sphere: 'friend' } },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await omarCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const convo = ((await accepted.json()) as { conversationId: string }).conversationId;
  const lina = await newPerson(linaCtx);
  const page = lina.page;
  await page.goto(`/c/${convo}`);
  // A name the safety reading trusts, on this machine: the server may read it in this run alone.
  // An address of this run's own, since the server keeps what a page said for a month and the
  // database outlives a run.
  const url = `${WEB_STUB.replace('127.0.0.1', 'localhost')}/menu?run=${suffix}`;
  const input = page.getByTestId('composer-input').filter({ visible: true });
  await input.fill(`Dinner here tonight? ${url}`);
  const writing = page.getByTestId('composer-link-preview').filter({ visible: true });
  await expect(writing).toContainText('The Corner Café — tonight’s menu');
  await expect(writing).toContainText('Grilled fish, saffron rice and lemon cake');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(page.getByTestId('composer-link-preview')).toHaveCount(0);
  const card = page.getByTestId('link-preview').filter({ visible: true });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('The Corner');
  // Omar's bubble has it too, its picture from Caime.
  const omarPage = (await newPerson(omarCtx)).page;
  const picture = omarPage.waitForResponse(
    (r) => /\/v1\/links\/[0-9a-f]{64}\/image$/.test(r.url()) && r.status() === 200,
  );
  await omarPage.goto(`/c/${convo}`);
  await expect(omarPage.getByTestId('link-preview').filter({ visible: true })).toContainText(
    'The Corner Café — tonight’s menu',
  );
  expect((await picture).headers()['content-type']).toBe('image/webp');
  // Taken off before sending: the message goes without its card.
  await input.fill(`Or here ${url}`);
  await expect(writing).toBeVisible();
  await writing.getByTestId('composer-link-remove').click();
  await expect(page.getByTestId('composer-link-preview')).toHaveCount(0);
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(
    page.getByLabel(/Or here .*(Sent|Delivered|Read)$/).filter({ visible: true }),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  // The site heard from the server alone: the page once, its picture once, no browser at all.
  const heard = (
    (await (await linaCtx.request.get(`${WEB_STUB}/requests`)).json()) as Array<{
      path: string;
      agent: string;
    }>
  ).slice(before);
  expect(heard.map((r) => r.path).sort()).toEqual(['/menu', '/menu.png']);
  for (const r of heard) expect(r.agent).toContain('link preview');
  // A text's flag is the only way to say so: the server answers the same message the same way.
  const again = await linaCtx.request.post(`/v1/conversations/${convo}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), body: `Once more ${url}` },
  });
  expect(
    ((await again.json()) as { message: { link: { title: string } | null } }).message.link,
  ).toMatchObject({ title: 'The Corner Café — tonight’s menu' });
  expect(lina.errors).toEqual([]);
  await linaCtx.close();
  await omarCtx.close();
});
