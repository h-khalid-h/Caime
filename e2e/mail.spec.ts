/**
 * Caime Mail (R75): a handle is an address. Mail from outside arrives as a message from a person
 * reached by email (a request first, since they're a stranger), a reply goes out from the
 * person's own address and says how far it got, a subject is a topic both ways, and Settings
 * shows the address. The provider stands in (e2e/mail-stub.mjs); its webhooks are posted here
 * as it would post them.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, MAIL_STUB, MAIL_WEBHOOK_SECRET, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const DOMAIN = 'caime.test';
const SARA = 'sara@partner.example';
let counter = 0;

/** A mail as the provider's inbound webhook posts it, from a sender its server vouched for. */
function inbound(m: { subject: string | null; text: string; inReplyTo?: string }) {
  counter++;
  const domain = SARA.replace(/^.*@/, '');
  return {
    FromFull: { Email: SARA, Name: 'Sara Haddad' },
    ToFull: [{ Email: `noor.post.${suffix}@${DOMAIN}`, Name: '' }],
    Subject: m.subject,
    MessageID: `pm-in-${suffix}-${counter}`,
    TextBody: m.text,
    HtmlBody: '',
    Headers: [
      { Name: 'Message-ID', Value: `<e2e-${suffix}-${counter}@${domain}>` },
      {
        Name: 'Authentication-Results',
        Value: `mx.${DOMAIN}; dkim=pass header.d=${domain}; spf=pass smtp.mailfrom=${SARA}; dmarc=pass header.from=${domain}`,
      },
      ...(m.inReplyTo
        ? [
            { Name: 'In-Reply-To', Value: m.inReplyTo },
            { Name: 'References', Value: m.inReplyTo },
          ]
        : []),
    ],
    Attachments: [],
  };
}

interface Sent {
  From: string;
  To: string;
  Subject: string;
  TextBody: string;
  Headers: Array<{ Name: string; Value: string }>;
  MessageID: string;
}

/** What Caime sent through the provider, oldest first. */
async function sent(): Promise<Sent[]> {
  const r = await fetch(`${MAIL_STUB}/sent`);
  return ((await r.json()) as { sent: Sent[] }).sent;
}

test.describe
  .serial('mail (R75)', () => {
    let desktop: BrowserContext;
    let page: Page;
    let errors: string[];
    const handle = `noor.post.${suffix}`;
    const address = `${handle}@${DOMAIN}`;

    test.beforeAll(async ({ browser }) => {
      desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await apiSignUp(desktop, 'Noor Post', handle);
      ({ page, errors } = await newPerson(desktop));
      await fetch(`${MAIL_STUB}/sent`, { method: 'DELETE' });
    });

    test.afterAll(async () => {
      await desktop.close();
    });

    /** Posted as the provider posts it: no session, the secret alone. */
    const post = async (path: string, data: unknown) => {
      const res = await fetch(
        `${test.info().project.use.baseURL}${path}?secret=${MAIL_WEBHOOK_SECRET}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      expect(res.ok, await res.clone().text()).toBe(true);
      return (await res.json()) as { outcomes?: Array<{ outcome: string }>; applied?: number };
    };

    test('the profile says the handle is an address too', async () => {
      await page.goto('/settings/profile');
      await expect(page.getByTestId('mail-address')).toContainText(address);
    });

    test('a stranger’s mail is a request from a person reached by email, said as mail', async () => {
      const got = await post(
        '/v1/mail/in/postmark',
        inbound({ subject: 'The March venue', text: 'Could you send me the contract by Friday?' }),
      );
      expect(got.outcomes?.[0]?.outcome).toBe('delivered');
      await page.goto('/chats');
      await visible(page, 'Message requests · 1').click();
      await visible(page, 'Sara Haddad').click();
      await page.waitForURL(/\/c\//);
      await expect(page.getByTestId('request-incoming')).toBeVisible();
      await expect(visible(page, 'Could you send me the contract by Friday?')).toBeVisible();
      await expect(page.getByTestId('message-mail').first()).toHaveText('by email ·');
      // No subject asked while the request waits: an answer carries the mail's own.
      await expect(page.getByTestId('composer-subject')).toHaveCount(0);
      // The person is said to be reached by email, never by a handle.
      await expect(visible(page, 'Reached by email')).toBeVisible();
      await expect(page.getByText(/@mail:/)).toHaveCount(0);
    });

    test('accepted, a reply goes out from her address in the thread, and says how far it got', async () => {
      await page.getByTestId('request-incoming').getByRole('button', { name: 'Accept' }).click();
      await expect(page.getByTestId('request-incoming')).toHaveCount(0);
      // Nothing live with them: no call to place.
      await expect(page.getByTestId('call-voice')).toHaveCount(0);
      await page.getByTestId('composer-input').fill('Of course. It’s on its way.');
      await page.getByTestId('composer-send').click();
      await expect(visible(page, 'Of course. It’s on its way.')).toBeVisible();
      await expect
        .poll(async () => (await sent()).length, { message: 'the reply left as mail' })
        .toBe(1);
      const [reply] = await sent();
      expect(reply?.From).toBe(`Noor Post <${address}>`);
      expect(reply?.To).toBe(SARA);
      expect(reply?.Subject).toBe('Re: The March venue');
      expect(reply?.TextBody).toBe('Of course. It’s on its way.');
      expect(reply?.Headers.find((h) => h.Name === 'In-Reply-To')?.Value).toBe(
        `<e2e-${suffix}-1@partner.example>`,
      );
      // The reply's own line (the list is drawn newest first, so never "the last one").
      const mine = page
        .getByTestId('message-mail')
        .filter({ hasText: /^(Sending|Sent|Delivered) by email/ });
      await expect(mine).toHaveText('Sent by email ·');
      // The provider says it was delivered; the message says so, live.
      expect(
        (
          await post('/v1/mail/events/postmark', [
            {
              RecordType: 'Delivery',
              MessageID: reply?.MessageID,
              DeliveredAt: new Date().toISOString(),
            },
          ])
        ).applied,
      ).toBe(1);
      await expect(mine).toHaveText('Delivered by email ·');
    });

    test('the composer shows the thread’s subject, and a subject written starts the topic it names', async () => {
      const subject = page.getByTestId('composer-subject');
      await expect(subject).toBeVisible();
      await expect(subject).toHaveValue('Re: The March venue');
      await page.getByTestId('composer-input').fill('Shall we book the hall?\nThe big one.');
      await expect(subject).toHaveValue('Re: The March venue');
      await subject.fill('Venue');
      const general = page.url();
      await page.getByTestId('composer-send').click();
      await page.waitForURL((url) => url.toString() !== general && /\/c\//.test(url.pathname));
      await expect(visible(page, 'Sara Haddad · Venue')).toBeVisible();
      await expect(visible(page, 'Shall we book the hall?')).toBeVisible();
      // In the topic, later mails carry its subject: nothing more is asked.
      await expect(page.getByTestId('composer-subject')).toHaveCount(0);
      await expect.poll(async () => (await sent()).length).toBe(2);
      const [, first] = await sent();
      expect(first?.Subject).toBe('Venue');
      expect(first?.TextBody).toBe('Shall we book the hall?\nThe big one.');
      // Her answer references our id: it lands in the topic, live, whatever its subject reads.
      const ourId = first?.Headers.find((h) => h.Name === 'Message-ID')?.Value ?? '';
      expect(ourId).toMatch(new RegExp(`^<[0-9a-f-]+@${DOMAIN}>$`));
      await post(
        '/v1/mail/in/postmark',
        inbound({ subject: 'RE: Venue', text: 'Booked.', inReplyTo: ourId }),
      );
      await expect(visible(page, 'Booked.')).toBeVisible();
      // A mail on a new subject is a topic of its own in Chats.
      await post('/v1/mail/in/postmark', inbound({ subject: 'The invoice', text: 'Attached.' }));
      await page.goto('/chats');
      await expect(visible(page, 'Sara Haddad · The invoice')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
