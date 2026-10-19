/**
 * The files place and links to one's own files (M16 H6): Noor finds the letter she sent Omar on
 * his page (the files between them), gives it out by a link for a month, and a visitor with no
 * account opens it, the letter's words on the page and the file a tap away; she takes the link
 * back and it opens nothing. On a phone's browser Omar opens the Word file from their chat as a
 * page of what it holds.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DOCX, letterDocx } from '../apps/server/test/office-fixtures';
import { apiSignUp, CLIENT, newPerson } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);

test('the files between two people, a link to one, and a Word file read as a page', async ({
  browser,
}) => {
  const noorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const omarContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await apiSignUp(noorContext, 'Noor Files', `noor.files.${stamp}`);
  const omar = await apiSignUp(omarContext, 'Omar Files', `omar.files.${stamp}`);
  const asked = await noorContext.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: omar.id },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await omarContext.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const convo = ((await accepted.json()) as { conversationId: string }).conversationId;
  const upload = await noorContext.request.post('/v1/files', {
    headers: CLIENT,
    multipart: {
      file: { name: 'Before your visit.docx', mimeType: DOCX, buffer: letterDocx() },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const { file } = (await upload.json()) as { file: { id: string } };
  const sent = await noorContext.request.post(`/v1/conversations/${convo}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), kind: 'file', body: 'The letter', fileIds: [file.id] },
  });
  expect(sent.ok(), await sent.text()).toBe(true);

  // Noor opens Omar's page: what they shared, and the letter among the files between them.
  const noor = await newPerson(noorContext);
  const page = noor.page;
  await page.goto(`/@omar.files.${stamp}`);
  await page.getByTestId('person-files').filter({ visible: true }).click();
  const row = page.getByTestId('shared-file').filter({ visible: true });
  await expect(row).toContainText('Before your visit.docx');
  await expect(row).toContainText('You');

  // A link to it for a month, for whoever has it.
  await row.getByTestId('shared-link-file').click();
  await page.getByTestId('file-link-days-30').click();
  await page.getByTestId('file-link-make').click();
  const shown = page.getByTestId('file-link-url').filter({ visible: true });
  await expect(shown).toContainText('/f/f_');
  const url = new URL((await shown.textContent()) ?? '');
  await expect(page.getByTestId('file-links-open').filter({ visible: true })).toContainText(
    'Anyone with the link',
  );
  await page.screenshot({ path: 'e2e/screenshots/desktop-file-link.png', animations: 'disabled' });

  // Someone with no account opens it: the file's words on the page, and the file itself.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await fresh.newPage();
  await visitor.goto(url.pathname);
  await expect(visitor.getByRole('heading', { name: 'Before your visit.docx' })).toBeVisible();
  await expect(visitor.getByText('Shared by Noor Files')).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Allergies' })).toBeVisible();
  await expect(visitor.getByRole('cell', { name: 'Aspirin' })).toBeVisible();
  await visitor.screenshot({
    path: 'e2e/screenshots/phone-file-link-page.png',
    animations: 'disabled',
    fullPage: true,
  });
  const token = url.pathname.split('/f/')[1] ?? '';
  const bytes = await fresh.request.get(`/v1/public/files/${token}?download=1`);
  expect(bytes.status()).toBe(200);
  expect(bytes.headers()['content-disposition']).toContain('attachment');

  // Its page counts the open, never who; taking it back closes it.
  const links = await noorContext.request.get(`/v1/files/${file.id}/links`);
  const [made] = ((await links.json()) as { links: Array<{ id: string; opens: number }> }).links;
  expect(made?.opens).toBe(1);
  await page.getByTestId(`file-link-revoke-${made?.id}`).filter({ visible: true }).click();
  await expect(
    page.getByText('Taken back: that link opens nothing now').filter({ visible: true }),
  ).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole('heading', { name: 'This link isn’t open' })).toBeVisible();

  // On his phone's browser, Omar opens the letter from their chat: a page of what it holds.
  const omarPerson = await newPerson(omarContext);
  await omarPerson.page.goto(`/c/${convo}`);
  const [letter] = await Promise.all([
    omarContext.waitForEvent('page'),
    omarPerson.page.getByTestId('message-file').filter({ visible: true }).click(),
  ]);
  await letter.waitForLoadState();
  expect(new URL(letter.url()).pathname).toBe(`/v1/files/${file.id}/view`);
  await expect(letter.getByRole('heading', { name: 'Allergies' })).toBeVisible();
  await expect(letter.getByRole('link', { name: 'Download' })).toBeVisible();
  await letter.screenshot({ path: 'e2e/screenshots/phone-file-view.png', animations: 'disabled' });
  expect(noor.errors).toEqual([]);
  expect(omarPerson.errors).toEqual([]);
  await noorContext.close();
  await omarContext.close();
  await fresh.close();
});
