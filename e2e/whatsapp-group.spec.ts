/**
 * A WhatsApp group brought over (M16 C3g): the .zip an iPhone's "Export chat" makes is unzipped
 * on the device and comes into a group its owner runs as a topic. Each name in it is taken as one
 * of the group's people (matched by name, or chosen) or kept as the name alone; WhatsApp's own
 * lines (the encryption notice, who added whom) stay behind. Everyone in the group reads it, each
 * line as its own person's.
 */
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

test('a WhatsApp group from an iPhone comes into the group as a topic, each line its own person’s', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const noorContext = await browser.newContext();
  const kimContext = await browser.newContext();
  const omarContext = await browser.newContext();
  await apiSignUp(noorContext, 'Noor Haddad', `noor.wg.${suffix}`);
  const kim = await apiSignUp(kimContext, 'Kim Lee', `kim.wg.${suffix}`);
  const omar = await apiSignUp(omarContext, 'Omar Farouk', `omar.wg.${suffix}`);
  for (const [context, person] of [
    [kimContext, kim],
    [omarContext, omar],
  ] as const) {
    const asked = await noorContext.request.post('/v1/connections/requests', {
      headers: CLIENT,
      data: { toUserId: person.id, relationship: { sphere: 'work', role: 'colleague' } },
    });
    const { requestId } = (await asked.json()) as { requestId: string };
    const accepted = await context.request.post(`/v1/connections/requests/${requestId}/accept`, {
      headers: CLIENT,
      data: {},
    });
    expect(accepted.ok(), await accepted.text()).toBe(true);
  }
  const title = `Family ${suffix}`;
  const made = await noorContext.request.post('/v1/conversations', {
    headers: CLIENT,
    data: { kind: 'group', title, memberIds: [kim.id, omar.id] },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const group = ((await made.json()) as { conversation: { id: string } }).conversation.id;

  // The export as an iPhone writes it: WhatsApp's own lines under the group's name with a mark
  // before their words, photos as "image omitted", and Kim under the name her phone knows her by.
  const mark = '‎';
  const chat = [
    `[13/03/2024, 09:01:02] Family: ${mark}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
    `${mark}[13/03/2024, 09:01:05] Family: ${mark}Noor Haddad added Omar Farouk`,
    '[13/03/2024, 09:02:11] Noor Haddad: Who’s bringing what on Friday?',
    '[13/03/2024, 09:03:40] Omar Farouk: The grill, and charcoal.',
    '[13/03/2024, 09:05:02] Kim 🌸: Salads! Two of them.',
    '[13/03/2024, 09:06:15] Uncle Sami: I’ll bring the dessert, as always',
    `${mark}[13/03/2024, 09:06:30] Uncle Sami: ${mark}image omitted`,
    `[14/03/2024, 18:31:00] Noor Haddad: See you all there ${suffix}`,
  ].join('\n');
  const zip = zipSync({
    '_chat.txt': strToU8(chat),
    '00000005-PHOTO-2024-03-13-09-06-30.jpg': new Uint8Array(256).fill(9),
  });

  const { page, errors } = await newPerson(noorContext);
  await page.goto(`/c/${group}`);
  const entry = page.getByTestId('import-whatsapp').filter({ visible: true });
  await expect(entry).toHaveText('Bring over a WhatsApp group');
  await entry.click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-pick').click();
  await (await chooser).setFiles({
    name: `WhatsApp Chat - ${title}.zip`,
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });

  // Read on this device: five messages from four people, the photo counted, the group's own
  // lines left out (its name is nobody's to choose).
  await expect(page.getByTestId('import-summary')).toContainText(
    /5 messages · Mar 13, 2024 to Mar 14, 2024 · a photo or file the export left out/,
  );
  await expect(page.getByRole('radio', { name: /Noor Haddad/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Family/ })).toHaveCount(0);
  const who = page.getByTestId('import-who');
  // Omar reads the same here; Kim is chosen; Uncle Sami isn't in the group, so his name stays.
  await expect(page.getByTestId('import-who-0')).toContainText('Omar Farouk');
  await expect(page.getByTestId('import-who-1')).toContainText('Not in this group: keep the name');
  await expect(page.getByTestId('import-who-2')).toContainText('Not in this group: keep the name');
  await expect(who).toContainText('Kim 🌸');
  await page.getByTestId('import-who-1').click();
  await page.getByTestId(`import-who-1-${kim.id}`).click();
  await expect(page.getByTestId('import-who-1')).toContainText('Kim Lee');
  await page.getByTestId('import-confirm').click();

  // It lands as the group's topic, in the order written, each line its writer's.
  await page.waitForURL((url) => !url.pathname.endsWith(group));
  await expect(visible(page, '5 messages brought over')).toBeVisible();
  await expect(
    visible(page, 'You brought this chat over from WhatsApp. What’s above was written there.'),
  ).toBeVisible();
  // A line is read out as whose it is: Noor's own, Kim's as hers, Uncle Sami's under his name.
  const line = (p: typeof page, label: RegExp) => p.getByLabel(label).filter({ visible: true });
  await expect(line(page, /^You, Who’s bringing what on Friday\?/)).toHaveCount(1);
  await expect(line(page, /^Omar Farouk, The grill, and charcoal\./)).toHaveCount(1);
  await expect(line(page, /^Kim Lee, Salads! Two of them\./)).toHaveCount(1);
  await expect(line(page, /^Uncle Sami, I’ll bring the dessert, as always/)).toHaveCount(1);
  await expect(page.getByText(/end-to-end encrypted/).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId('message-imported').filter({ visible: true })).toHaveCount(5);
  await page.screenshot({ path: 'e2e/screenshots/desktop-whatsapp-group-import.png' });

  // Kim reads it as the group's topic, her salads as her own line and nobody's name above it.
  const { page: kimPage, errors: kimErrors } = await newPerson(kimContext);
  await kimPage.goto('/chats');
  await visible(kimPage, `${title} · WhatsApp`).click();
  await expect(
    visible(
      kimPage,
      'Noor Haddad brought this chat over from WhatsApp. What’s above was written there.',
    ),
  ).toBeVisible();
  await expect(line(kimPage, /^You, Salads! Two of them\./)).toHaveCount(1);
  await expect(line(kimPage, /^Noor Haddad, Who’s bringing what on Friday\?/)).toHaveCount(1);
  await expect(line(kimPage, /^Uncle Sami, I’ll bring the dessert, as always/)).toHaveCount(1);
  expect([...errors, ...kimErrors]).toEqual([]);
  await noorContext.close();
  await kimContext.close();
  await omarContext.close();
});
