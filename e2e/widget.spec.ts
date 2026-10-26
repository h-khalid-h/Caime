/**
 * An organization's door on its own website (R117, M17 I17a): once it proves its domain, its setup
 * hands it one line to paste; a page on that domain frames the widget, a visitor on a phone writes
 * in it and types the code without leaving the page, and the message is in the team's Business
 * inbox; a link out opens on Caime in a new tab; a page anywhere else is refused the frame.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, mailsTo, newPerson, publishTxt } from './helpers';

test('a visitor writes from the widget on the organization’s own site; nobody else frames it', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const domain = `nile-${suffix}.example`;
  const handle = `nile.wg.${suffix}`;
  const team = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(team, 'Noor Haddad', `noor.wg.${suffix}`);
  const made = await team.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const orgId = ((await made.json()) as { org: { id: string } }).org.id;

  // Before its domain is proved, the setup says how to get the line.
  const { page: setup, errors } = await newPerson(team);
  await setup.goto(`/o/${handle}/setup`);
  const widget = setup.getByTestId('org-door-widget').filter({ visible: true });
  await expect(widget).toContainText('Verify your domain below');

  const set = await team.request.put(`/v1/orgs/${orgId}/domain`, {
    headers: CLIENT,
    data: { domain },
  });
  const { record } = ((await set.json()) as { org: { domain: { record: { value: string } } } }).org
    .domain;
  await publishTxt(`_caime-verify.${domain}`, [record.value]);
  const checked = await team.request.post(`/v1/orgs/${orgId}/domain/check`, { headers: CLIENT });
  expect(checked.ok(), await checked.text()).toBe(true);

  // Verified, the setup hands over the one line, naming the domain that may show it.
  await setup.reload();
  await expect(widget).toContainText(`Only pages at ${domain} can show it.`);
  const code = setup.getByTestId('org-door-widget-code').filter({ visible: true });
  await expect(code).toContainText(`/o/${handle}/widget`);
  const snippet = (await code.textContent()) ?? '';
  expect(snippet).toMatch(/^<iframe src="[^"]+" title="Nile Dental" loading="lazy"/);
  expect(errors).toEqual([]);

  // The organization's own site, on a phone, with the line pasted into it.
  // The stand-in site has a public name (https, as a site is) while Caime here is localhost,
  // which Chromium's Local Network Access keeps a public page from framing unless allowed; in
  // production both are public. Allowed, any refusal below is the widget's own frame-ancestors.
  const visitor = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['local-network-access'],
  });
  const site = await visitor.newPage();
  const sitePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nile Dental</title></head><body><h1>Nile Dental</h1><p>Teeth, gently.</p>${snippet}</body></html>`;
  await visitor.route(
    (url) => url.hostname === `www.${domain}`,
    (route) => route.fulfill({ contentType: 'text/html', body: sitePage }),
  );
  await site.goto(`https://www.${domain}/`);
  const frame = site.frameLocator('iframe');
  await expect(frame.locator('#write')).toBeVisible();
  // A verified organization is one anyone may write to (R29): name, address, message.
  const email = `hana.wg.${suffix}@example.com`;
  await frame.locator('#write input[name="name"]').fill('Hana Patient');
  await frame.locator('#write input[name="email"]').fill(email);
  await frame.locator('#write textarea[name="message"]').fill('Do you see children on Saturdays?');
  await frame.locator('#write button[type="submit"]').click();
  await expect(frame.getByText('Check your email')).toBeVisible();
  // Still the organization's site around it.
  await expect(site).toHaveURL(`https://www.${domain}/`);
  let typed = '';
  await expect
    .poll(async () => {
      typed = /^(\d{6}) /.exec((await mailsTo(email)).at(-1)?.subject ?? '')?.[1] ?? '';
      return typed;
    })
    .toMatch(/^\d{6}$/);
  await frame.locator('#write input[name="code"]').fill(typed);
  await frame.locator('#write button[type="submit"]').click();
  await expect(frame.getByText('Your message is with Nile Dental.')).toBeVisible();
  await site.screenshot({
    path: 'e2e/screenshots/phone-widget-on-site.png',
    animations: 'disabled',
  });

  // A link out opens on Caime in a tab of its own; the site stays.
  const opened = visitor.waitForEvent('page');
  await frame.locator('.embed-foot a').click();
  const caime = await opened;
  await expect(caime).toHaveURL(new RegExp(`/o/${handle.replaceAll('.', '\\.')}$`));
  await expect(site).toHaveURL(`https://www.${domain}/`);

  // The team has it, from the provisional customer, as any customer's first message.
  const inbox = await team.request.get(`/v1/orgs/${orgId}/inbox`, { headers: CLIENT });
  type Thread = { customer?: { displayName?: string } };
  const threads = ((await inbox.json()) as { threads: Thread[] }).threads;
  expect(threads.map((th) => th.customer?.displayName)).toContain('Hana Patient');

  // Anywhere else, the browser refuses the frame.
  const elsewhere = await visitor.newPage();
  await visitor.route(
    (url) => url.hostname === `copy-${suffix}.example`,
    (route) => route.fulfill({ contentType: 'text/html', body: sitePage }),
  );
  const refused = elsewhere.waitForEvent('console', (m) => m.text().includes('frame-ancestors'));
  await elsewhere.goto(`https://copy-${suffix}.example/`);
  await refused;
  await expect(elsewhere.frameLocator('iframe').locator('#write')).toHaveCount(0);

  // The widget itself reads as every visitor's page should.
  const alone = await visitor.newPage();
  await alone.goto(`/o/${handle}/widget`);
  await alone.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page: alone })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
