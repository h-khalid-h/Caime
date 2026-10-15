/**
 * Connected accounts (R90): Noor connects a Google account from Settings · Apps for its calendar.
 * The consent comes back to the screen with a claim it redeems, the server reads when Noor is
 * busy there (never in the browser), the row says it was read, and Noor's bookable slots leave
 * that hour out. Disconnecting tells Google and gives the hour back.
 */
import { expect, test } from '@playwright/test';
import { ACCOUNTS_STUB, apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);

/** Two days from now, at an hour in UTC. */
const dayAhead = (() => {
  const d = new Date(Date.now() + 2 * 86_400_000);
  return d.toISOString().slice(0, 10);
})();
const at = (hhmm: string) => `${dayAhead}T${hhmm}:00Z`;

test('a Google calendar connected in Settings keeps its busy hour out of the bookable slots', async ({
  browser,
}) => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const noor = await apiSignUp(desktop, 'Noor Calendar', `noor.calendar.${stamp}`);
  const set = await desktop.request.put('/v1/me/booking', {
    headers: CLIENT,
    data: {
      booking: {
        timeZone: 'UTC',
        slotMinutes: 60,
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '08:00', end: '13:00' })),
        leadMinutes: 0,
        horizonDays: 7,
      },
      items: [
        {
          id: 'lesson',
          name: 'Lesson',
          price: null,
          unit: 'minutes',
          minutes: 60,
          capacity: 1,
          maxQuantity: 1,
          audience: 'public',
          providers: null,
          askTopic: false,
        },
      ],
    },
  });
  expect(set.ok(), await set.text()).toBe(true);
  const busy = await fetch(`${ACCOUNTS_STUB}/busy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{ start: at('10:00'), end: at('11:00') }]),
  });
  expect(busy.ok).toBe(true);
  const slots = async () => {
    const res = await desktop.request.get(
      `/v1/people/${noor.id}/slots?from=${at('00:00')}&to=${dayAhead}T23:59:00Z&item=lesson`,
      { headers: CLIENT },
    );
    expect(res.ok(), await res.text()).toBe(true);
    return ((await res.json()) as { slots: string[] }).slots.map((s) => s.slice(11, 16));
  };
  expect(await slots()).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);

  const { page, errors } = await newPerson(desktop);
  await page.goto('/settings/apps');
  await expect(visible(page, 'Your accounts')).toBeVisible();
  await page.getByTestId('account-connect-google').click();
  // Google's consent, given at once, and back to the same screen, which finishes it.
  await page.waitForURL(/\/settings\/apps/);
  const row = page.getByTestId('account-google').filter({ visible: true });
  await expect(row).toContainText('noor.e2e@gmail.example');
  // The address no longer carries the claim.
  expect(page.url()).not.toContain('claim=');
  // Read by the server a moment later; the row says so on its own.
  await expect(page.getByTestId('account-google-state').filter({ visible: true })).toContainText(
    /Calendar · read /,
  );
  expect(await slots()).toEqual(['08:00', '09:00', '11:00', '12:00']);
  await page.screenshot({
    path: 'e2e/screenshots/desktop-connected-accounts.png',
    animations: 'disabled',
  });
  const requests = (
    (await (await fetch(`${ACCOUNTS_STUB}/requests`)).json()) as {
      requests: Array<{ path: string; browser: boolean }>;
    }
  ).requests;
  // Only Caime's server spoke to Google past the consent page.
  const calendar = requests.filter((r) => r.path === '/gcal/freeBusy');
  expect(calendar.length).toBeGreaterThan(0);
  expect(calendar.every((r) => !r.browser)).toBe(true);

  await page.getByTestId('account-google-remove').filter({ visible: true }).click();
  await page.getByTestId('account-remove-confirm').click();
  await expect(page.getByTestId('account-google')).toHaveCount(0);
  await expect(page.getByTestId('account-connect-google').filter({ visible: true })).toBeVisible();
  expect(await slots()).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);
  const after = (
    (await (await fetch(`${ACCOUNTS_STUB}/requests`)).json()) as {
      requests: Array<{ path: string; browser: boolean }>;
    }
  ).requests;
  expect(after.some((r) => r.path === '/google/revoke' && !r.browser)).toBe(true);
  expect(errors).toEqual([]);
  await desktop.close();
});

test('a file from OneDrive is attached in a conversation, copied in as an upload', async ({
  browser,
}) => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const other = await browser.newContext();
  await apiSignUp(desktop, 'Noor Drive', `noor.drive.${stamp}`);
  const sara = await apiSignUp(other, 'Sara Drive', `sara.drive.${stamp}`);
  const made = await desktop.request.post('/v1/conversations', {
    headers: CLIENT,
    data: { kind: 'direct', userId: sara.id },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const conversationId = ((await made.json()) as { conversation: { id: string } }).conversation.id;
  const { page, errors } = await newPerson(desktop);
  // Connected for the calendar, then Files added: the provider asks again, and keeps the rest.
  await page.goto('/settings/apps');
  await page.getByTestId('account-connect-microsoft').click();
  await page.waitForURL(/\/settings\/apps/);
  const row = page.getByTestId('account-microsoft').filter({ visible: true });
  await expect(row).toContainText('noor.e2e@outlook.example');
  await page.getByTestId('account-microsoft-add-files').filter({ visible: true }).click();
  await page.waitForURL(/\/settings\/apps/);
  await expect(page.getByTestId('account-microsoft-state').filter({ visible: true })).toContainText(
    'Calendar · Files',
  );
  // In the conversation, OneDrive is offered beside a file from this device.
  await page.goto(`/c/${conversationId}`);
  await page.getByTestId('composer-attach').filter({ visible: true }).click();
  await page.getByTestId('attach-drive-microsoft').click();
  await page.getByTestId('drive-item-Clinic').click();
  await expect(page.getByTestId('drive-up')).toBeVisible();
  await page.screenshot({
    path: 'e2e/screenshots/desktop-onedrive-browse.png',
    animations: 'disabled',
  });
  await page.getByTestId('drive-item-Clinic plan.txt').click();
  await expect(page.getByTestId('message-file').filter({ visible: true })).toContainText(
    'Clinic plan.txt',
  );
  // Only Caime's server read the drive, and the bytes came without the access.
  const requests = (
    (await (await fetch(`${ACCOUNTS_STUB}/requests`)).json()) as {
      requests: Array<{ path: string; browser: boolean; access: string | null }>;
    }
  ).requests;
  const drive = requests.filter((r) => r.path.startsWith('/v1.0/me/drive/'));
  expect(drive.length).toBeGreaterThan(0);
  expect(drive.every((r) => !r.browser)).toBe(true);
  expect(requests.find((r) => r.path === '/blob/note1')?.access ?? null).toBeNull();
  expect(errors).toEqual([]);
  await desktop.close();
  await other.close();
});
