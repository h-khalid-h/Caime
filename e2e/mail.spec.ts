/**
 * Caime Mail (R75): a handle is an address. Mail from outside arrives as a message from a person
 * reached by email (a request first, since they're a stranger), a reply goes out from the
 * person's own address and says how far it got, a subject is a topic both ways, and Settings
 * shows the address. The provider stands in (e2e/mail-stub.mjs); its webhooks are posted here
 * as it would post them.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { DKIM_TXT, rawMail } from '../apps/server/test/mail-fixtures';
import {
  apiSignUp,
  MAIL_STUB,
  MAIL_WEBHOOK_SECRET,
  newPerson,
  publishTxt,
  visible,
} from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const DOMAIN = 'caime.test';
const SARA = 'sara@partner.example';
let counter = 0;

/**
 * A mail as the provider's inbound webhook posts it: the parsed fields, and the raw message
 * DKIM-signed for Sara's domain, whose key the DNS stand-in publishes (Caime checks it itself).
 */
async function inbound(m: { subject: string | null; text: string; inReplyTo?: string }) {
  counter++;
  const domain = SARA.replace(/^.*@/, '');
  const messageId = `<e2e-${suffix}-${counter}@${domain}>`;
  const to = `noor.post.${suffix}@${DOMAIN}`;
  const raw = await rawMail({
    from: SARA,
    fromName: 'Sara Haddad',
    to: [to],
    subject: m.subject,
    text: m.text,
    messageId,
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: [m.inReplyTo] } : {}),
  });
  return {
    FromFull: { Email: SARA, Name: 'Sara Haddad' },
    ToFull: [{ Email: to, Name: '' }],
    Subject: m.subject,
    MessageID: `pm-in-${suffix}-${counter}`,
    TextBody: m.text,
    HtmlBody: '',
    Headers: [
      { Name: 'Message-ID', Value: messageId },
      ...(m.inReplyTo
        ? [
            { Name: 'In-Reply-To', Value: m.inReplyTo },
            { Name: 'References', Value: m.inReplyTo },
          ]
        : []),
    ],
    Attachments: [],
    RawEmail: raw,
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
      // Sara's domain publishes the key her mail is signed with.
      await publishTxt(`test._domainkey.${SARA.replace(/^.*@/, '')}`, [DKIM_TXT]);
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
        await inbound({
          subject: 'The March venue',
          text: 'Could you send me the contract by Friday?',
        }),
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
      // The words, then a link back to Caime and that its sender is told when it's opened (R75).
      expect(reply?.TextBody).toMatch(
        /^Of course\. It’s on its way\.\n\n--\nOpen in Caime: \S+\nNoor Post is told when this mail is opened\.$/,
      );
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
      expect(first?.TextBody?.startsWith('Shall we book the hall?\nThe big one.\n\n--\n')).toBe(
        true,
      );
      // Her answer references our id: it lands in the topic, live, whatever its subject reads.
      const ourId = first?.Headers.find((h) => h.Name === 'Message-ID')?.Value ?? '';
      expect(ourId).toMatch(new RegExp(`^<[0-9a-f-]+@${DOMAIN}>$`));
      await post(
        '/v1/mail/in/postmark',
        await inbound({ subject: 'RE: Venue', text: 'Booked.', inReplyTo: ourId }),
      );
      await expect(visible(page, 'Booked.')).toBeVisible();
      // A mail on a new subject is a topic of its own in Chats.
      await post(
        '/v1/mail/in/postmark',
        await inbound({ subject: 'The invoice', text: 'Attached.' }),
      );
      await page.goto('/chats');
      await expect(visible(page, 'Sara Haddad · The invoice')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('an address not on Caime, typed in Connect, is written to by email (R93)', async () => {
      const layla = `layla.${suffix}@outside.example`;
      await page.goto('/connect');
      await page.getByTestId('connect-search').fill(layla);
      await page.getByTestId('write-by-email').filter({ visible: true }).click();
      await page.waitForURL(/\/c\//);
      await page.getByTestId('composer-input').fill('Hi Layla, are we still on for Thursday?');
      await page.getByTestId('composer-send').click();
      await expect
        .poll(async () => (await sent()).find((m) => m.To === layla)?.TextBody ?? '')
        .toContain(`Noor Post wrote this on Caime, from ${address}`);
      expect(errors).toEqual([]);
    });

    test('mail its sender couldn’t be confirmed for waits under Notices, saying so (M16 F1)', async () => {
      // Unsigned, and from no server the provider saw connect: nothing vouches for its From.
      const from = `billing.${suffix}@bank.example`;
      const to = address;
      const messageId = `<e2e-${suffix}-unverified@bank.example>`;
      const text = 'Your invoice is overdue. Please pay it today.';
      const raw = await rawMail({
        from,
        fromName: 'Your Bank',
        to: [to],
        subject: 'Invoice overdue',
        text,
        messageId,
        dkim: 'none',
        hop: null,
      });
      const got = await post('/v1/mail/in/postmark', {
        FromFull: { Email: from, Name: 'Your Bank' },
        ToFull: [{ Email: to, Name: '' }],
        Subject: 'Invoice overdue',
        MessageID: `pm-in-${suffix}-unverified`,
        TextBody: text,
        HtmlBody: '',
        Headers: [{ Name: 'Message-ID', Value: messageId }],
        Attachments: [],
        RawEmail: raw,
      });
      expect(got.outcomes?.[0]?.outcome).toBe('kept_unverified');
      await page.goto('/chats');
      await visible(page, 'Notices · 1').click();
      // Named by the address it claims, never by the name it gave.
      await visible(page, from).click();
      await page.waitForURL(/\/c\//);
      await expect(visible(page, text)).toBeVisible();
      await expect(page.getByTestId('message-mail').first()).toHaveText(
        'by email, sender not confirmed ·',
      );
      await expect(
        visible(
          page,
          `Caime couldn’t confirm this mail came from ${from}: it’s here to read, and nothing is sent from here.`,
        ),
      ).toBeVisible();
      await expect(visible(page, 'Sender not confirmed')).toBeVisible();
      await expect(page.getByText('Your Bank')).toHaveCount(0);
      await expect(page.getByTestId('composer-input')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('a meeting goes by email as an invitation, and their calendar’s yes agrees it (M16 F3)', async () => {
      const tarek = `tarek.${suffix}@outside.example`;
      // His domain signs his calendar's answer, as Sara's signs her mail.
      await publishTxt('test._domainkey.outside.example', [DKIM_TXT]);
      await page.goto('/connect');
      await page.getByTestId('connect-search').fill(tarek);
      await page.getByTestId('write-by-email').filter({ visible: true }).click();
      await page.waitForURL(/\/c\//);
      // Only what a mail carries is offered: no sticker, no poll.
      await expect(page.getByTestId('composer-stickers')).toHaveCount(0);
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await expect(page.getByTestId('kit-option-poll')).toHaveCount(0);
      await page.getByTestId('kit-option-meeting').click();
      // One time: a series doesn't travel by mail.
      await expect(page.getByTestId('kit-repeat')).toHaveCount(0);
      await page.getByLabel('Title').fill('Venue walkthrough');
      await page.getByLabel('When', { exact: true }).fill('Friday 3pm');
      // Held on Caime, nobody could join it from a mail: it says where it must be.
      await page.getByTestId('kit-send').click();
      await expect(
        visible(page, 'Say where it is: someone reached by email can’t join a call on Caime.'),
      ).toBeVisible();
      await page.getByLabel('Where (optional)').fill('meet.google.com/abc-defg-hij');
      await page.getByTestId('kit-send').click();
      const card = page
        .getByTestId('kit-meeting')
        .filter({ hasText: 'Venue walkthrough', visible: true });
      await expect(card).toContainText('Proposed');
      // Its words and its invitation, from Noor's own address.
      await expect
        .poll(async () => (await sent()).find((m) => m.To === tarek)?.Subject ?? '')
        .toBe('Meeting: Venue walkthrough');
      const mail = (await sent()).find((m) => m.To === tarek) as Sent & {
        Attachments?: Array<{ Name: string; ContentType: string; Content: string }>;
      };
      expect(mail.TextBody).toContain('Where: meet.google.com/abc-defg-hij');
      const invite = mail.Attachments?.find((a) => a.Name === 'invite.ics');
      expect(invite?.ContentType).toBe('text/calendar; method=REQUEST; charset=UTF-8');
      const ics = Buffer.from(invite?.Content ?? '', 'base64')
        .toString('utf8')
        .replace(/\r\n[ \t]/g, '');
      expect(ics).toContain(`ORGANIZER;CN="Noor Post":mailto:${address}`);
      const uid = /^UID:(\S+)$/m.exec(ics)?.[1] ?? '';
      expect(uid).toMatch(/^meeting-[0-9a-f-]{36}@caime$/);
      // His calendar's yes comes back to Noor's address, signed by his domain: the card is agreed.
      const answer = [
        'BEGIN:VCALENDAR',
        'METHOD:REPLY',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `ATTENDEE;CN=Tarek;PARTSTAT=ACCEPTED:mailto:${tarek}`,
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n');
      const messageId = `<e2e-${suffix}-yes@outside.example>`;
      const text = 'Tarek has accepted this invitation.';
      const got = await post('/v1/mail/in/postmark', {
        FromFull: { Email: tarek, Name: 'Tarek' },
        ToFull: [{ Email: address, Name: '' }],
        Subject: 'Accepted: Venue walkthrough',
        MessageID: `pm-in-${suffix}-yes`,
        TextBody: text,
        HtmlBody: '',
        Headers: [{ Name: 'Message-ID', Value: messageId }],
        Attachments: [
          {
            Name: 'invite.ics',
            ContentType: 'application/ics',
            Content: Buffer.from(answer).toString('base64'),
          },
        ],
        RawEmail: await rawMail({
          from: tarek,
          fromName: 'Tarek',
          to: [address],
          subject: 'Accepted: Venue walkthrough',
          text,
          messageId,
        }),
      });
      expect(got.outcomes?.[0]?.outcome).toBe('answered');
      await expect(card).toContainText('Accepted');
      // Nothing posted: the card says it.
      await expect(page.getByText(text)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
