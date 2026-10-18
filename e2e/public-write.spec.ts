/**
 * Writing before an account (R97 (1), M16 C1d): a visitor on a phone arrives by an
 * organization's door (`/o/<handle>?write`, its link and QR), writes in three fields, types the
 * code the mail stand-in received, and the message is in the team's Business inbox; the team
 * answers in the app, and the answer goes to the visitor as mail from the organization's address.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, MAIL_STUB, mailsTo, newPerson, visible } from './helpers';

/** What Caime sent through the mail provider, oldest first. */
async function sentBy(): Promise<
  Array<{ From: string; To: string; Subject: string; TextBody: string }>
> {
  const r = await fetch(`${MAIL_STUB}/sent`);
  return (
    (await r.json()) as {
      sent: Array<{ From: string; To: string; Subject: string; TextBody: string }>;
    }
  ).sent;
}

test('a visitor writes from the door with a code; the team answers and it goes by mail', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const team = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(team, 'Noor Haddad', `noor.pw.${suffix}`);
  const handle = `nile.pw.${suffix}`;
  const made = await team.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;

  // A visitor by the door, on a phone: no account, no cookie, no script, the three fields first.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await visitor.newPage();
  const started = Date.now();
  await page.goto(`/o/${handle}?write`);
  await expect(page.locator('#static')).toBeVisible();
  expect(await page.locator('script[src]').count()).toBe(0);
  await expect(page.locator('#write')).toBeInViewport();
  const email = `hana.pw.${suffix}@example.com`;
  await page.locator('#write input[name="name"]').fill('Hana Patient');
  await page.locator('#write input[name="email"]').fill(email);
  await page
    .locator('#write textarea[name="message"]')
    .fill('Do you have time on Saturday for a check-up?');
  // Not yet verified: the page asks the age (R29).
  await page.locator('#write input[name="adult"]').check();
  await page.locator('#write button[type="submit"]').click();
  await expect(visible(page, 'Check your email')).toBeVisible();
  await expect(page).toHaveURL(/[?&]write-code=/);

  // The code, from the mail stand-in, typed on the page.
  let code = '';
  await expect
    .poll(async () => {
      const mails = await mailsTo(email);
      code = /^(\d{6}) /.exec(mails.at(-1)?.subject ?? '')?.[1] ?? '';
      return code;
    })
    .toMatch(/^\d{6}$/);
  await page.locator('#write input[name="code"]').fill(code);
  await page.locator('#write button[type="submit"]').click();
  await expect(visible(page, 'Your message is with Nile Dental.')).toBeVisible();
  await expect(visible(page, new RegExp(`Their answer comes to ${email} by email`))).toBeVisible();
  const doorToMessage = Date.now() - started;
  const measured = `${(doorToMessage / 1000).toFixed(1)} s from opening the door to the message sent, without an account`;
  test.info().annotations.push({ type: 'door-to-message-no-account', description: measured });
  console.log(`door-to-message-no-account: ${measured}`);
  await page.screenshot({ path: 'e2e/screenshots/phone-door-written.png', animations: 'disabled' });
  // Nothing of the team on the visitor's page.
  await expect(page.getByText('Noor Haddad')).toHaveCount(0);

  // The team: the message in its Business inbox, from the provisional customer.
  const inbox = await team.request.get(`/v1/orgs/${orgId}/inbox`, { headers: CLIENT });
  type Thread = { conversationId: string; customer?: { handle?: string; displayName?: string } };
  const threads = ((await inbox.json()) as { threads: Thread[] }).threads;
  const thread = threads.find((th) => th.customer?.displayName === 'Hana Patient');
  expect(thread, JSON.stringify(threads.map((th) => th.customer?.displayName))).toBeDefined();

  // It answers in the app, as to anyone.
  const { page: noor, errors } = await newPerson(team);
  await noor.goto(`/o/${handle}/inbox`);
  await noor
    .getByTestId(`thread-row-${thread?.customer?.handle ?? thread?.conversationId}`)
    .click();
  await expect(visible(noor, 'Do you have time on Saturday for a check-up?')).toBeVisible();
  await noor.getByTestId('composer-input').fill('Yes, Saturday at 10 works. See you then.');
  await noor.getByTestId('composer-send').click();
  await expect(visible(noor, 'Yes, Saturday at 10 works. See you then.')).toBeVisible();

  // The answer reaches the visitor as mail from the organization's address, on what they wrote.
  await expect
    .poll(async () => (await sentBy()).filter((m) => m.To === email).map((m) => m.Subject))
    .toContain('Re: Do you have time on Saturday for a check-up?');
  const answer = (await sentBy()).find((m) => m.To === email);
  expect(answer?.From).toBe(`Nile Dental <${handle}@caime.test>`);
  expect(answer?.TextBody).toContain('Yes, Saturday at 10 works.');
  expect(answer?.TextBody).toContain('Reply to this mail to answer');
  expect(answer?.TextBody).not.toContain('Noor Haddad');
  expect(errors).toEqual([]);
  await visitor.close();
  await team.close();
});
