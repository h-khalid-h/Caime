/**
 * Who sent a mail in, as Caime checks the raw message itself (R75, review 2026-10-13): DKIM
 * against DNS, SPF for the address Postmark's own server saw connect, DMARC; and nothing a
 * sender wrote into their own headers counts.
 */
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context';
import { authenticateMail, NO_AUTH, receivingHop } from '../src/lib/mail-auth';
import { senderVerified } from '../src/lib/mail-in';
import { BULK_DOMAIN, BULK_IP, mailDns, rawMail, SENDER_IP } from './mail-fixtures';

const POSTMARK = /(^|\.)(postmarkapp\.com|mtasv\.net)$/i;
const ctx = (dmarc: Record<string, string> = {}) =>
  ({
    dns: mailDns(dmarc),
    config: { MAIL_DOMAIN: 'caime.test' },
    log: { warn: () => {} },
  }) as unknown as AppContext;
const mail = (over: Partial<Parameters<typeof rawMail>[0]> = {}) =>
  rawMail({
    from: 'sara@partner.example',
    to: ['noor@caime.test'],
    text: 'Could you send me the contract by Friday?',
    messageId: '<m1@partner.example>',
    ...over,
  });
const verified = async (raw: string | null, dmarc: Record<string, string> = {}) =>
  senderVerified('sara@partner.example', await authenticateMail(ctx(dmarc), raw, POSTMARK));

describe('mail in: who sent it, checked by Caime (R75)', () => {
  it('a valid DKIM signature for the From domain vouches, wherever the mail came from', async () => {
    expect(await verified(await mail({ hop: null }))).toBe(true);
    const auth = await authenticateMail(ctx(), await mail(), POSTMARK);
    expect(auth.dkim).toEqual([{ result: 'pass', domain: 'partner.example' }]);
  });

  it('a signature the published key does not verify vouches for nothing', async () => {
    expect(await verified(await mail({ dkim: 'wrong-key', hop: null }))).toBe(false);
    const auth = await authenticateMail(
      ctx(),
      await mail({ dkim: 'wrong-key', hop: null }),
      POSTMARK,
    );
    expect(auth.dkim[0]?.result).toBe('fail');
  });

  it('SPF vouches for an unsigned mail only from the address Postmark saw connect', async () => {
    // From an address the domain's SPF allows, as Postmark's own Received line says.
    expect(await verified(await mail({ dkim: 'none' }))).toBe(true);
    // From one it doesn't.
    expect(await verified(await mail({ dkim: 'none', hop: { ip: BULK_IP } }))).toBe(false);
    // No Received line of Postmark's: no SPF at all.
    expect(await verified(await mail({ dkim: 'none', hop: null }))).toBe(false);
  });

  it('SPF for another domain (a bulk sender’s bounce address) is not the From domain’s', async () => {
    const raw = await mail({
      dkim: 'none',
      hop: { ip: BULK_IP, envelopeFrom: `bounce@${BULK_DOMAIN}` },
    });
    const auth = await authenticateMail(ctx(), raw, POSTMARK);
    expect(auth.spf).toEqual({ result: 'pass', domain: BULK_DOMAIN });
    expect(senderVerified('sara@partner.example', auth)).toBe(false);
  });

  it('a verdict or a Received line the sender wrote themselves counts for nothing', async () => {
    const forged = await mail({
      dkim: 'none',
      hop: null,
      senderLines: [
        'Authentication-Results: mx.caime.test; dkim=pass header.d=partner.example; spf=pass smtp.mailfrom=sara@partner.example; dmarc=pass header.from=partner.example',
        'Received-SPF: Pass (sender SPF authorized) identity=mailfrom; envelope-from=sara@partner.example;',
        `Received: from mail.partner.example (mail.partner.example [${SENDER_IP}]) by mx.partner.example with ESMTPS id X; Tue, 20 Oct 2026 07:59:00 +0000`,
      ],
    });
    expect(await verified(forged)).toBe(false);
    // Nor does a Received line naming Postmark when it isn't the topmost one.
    expect(receivingHop(forged, POSTMARK)).toBeNull();
  });

  it('a signature over part of the body vouches for nothing once words follow it', async () => {
    const dmarc = { 'partner.example': 'v=DMARC1; p=reject' };
    // Signed with a length limit and nothing after it: the whole message is signed.
    expect(await verified(await mail({ hop: null, appended: '' }), dmarc)).toBe(true);
    // A forger's words below the signed part, from anywhere.
    const forged = await mail({ hop: null, appended: 'P.S. Wire the deposit to IBAN XX00 0000.' });
    const auth = await authenticateMail(ctx(dmarc), forged, POSTMARK);
    expect(auth.dkim).toEqual([{ result: 'other', domain: 'partner.example' }]);
    expect(auth.dmarc?.result).toBe('other');
    expect(senderVerified('sara@partner.example', auth)).toBe(false);
  });

  it('DMARC is read from the domain’s own record', async () => {
    const auth = await authenticateMail(
      ctx({ 'partner.example': 'v=DMARC1; p=reject' }),
      await mail(),
      POSTMARK,
    );
    expect(auth.dmarc).toEqual({ result: 'pass', domain: 'partner.example' });
  });

  it('checking a mail leaves the dispatcher every fetch in the server uses as it was', async () => {
    // mailauth's root loads BIMI, whose undici puts its own in place (a backup's upload broke).
    await authenticateMail(ctx(), await mail(), POSTMARK);
    expect(
      (globalThis as Record<symbol, unknown>)[Symbol.for('undici.globalDispatcher.2')],
    ).toBeUndefined();
  });

  it('without the raw message nothing is vouched for', async () => {
    expect(await authenticateMail(ctx(), null, POSTMARK)).toEqual(NO_AUTH);
    expect(await verified(null)).toBe(false);
  });

  it('reads past Postmark’s own local hand-off to the line from outside (as Postmark writes it)', async () => {
    // The top of a real Postmark inbound message (2026-10-15): its Postfix's local delivery first,
    // its spam check and SPF verdict, then the line that names who connected.
    const top = [
      'Received: by p-pm-inboundg03a-aws-useast1a.inbound.postmarkapp.com (Postfix, from userid 996)',
      '\tid E8ADC453CA3; Thu, 15 Oct 2026 00:42:13 +0000 (UTC)',
      'X-Spam-Status: No',
      'Received-SPF: pass (datac.example: Sender is authorized) receiver=p-pm-inboundg03a-aws-useast1a; identity=mailfrom; client-ip=192.0.2.66',
      'Received: from mail-pl1-f174.google.com (mail-pl1-f174.google.com [198.51.100.174])',
      '\t(using TLSv1.2 with cipher ECDHE-RSA-AES128-GCM-SHA256 (128/128 bits))',
      '\t(No client certificate requested)',
      '\tby p-pm-inboundg03a-aws-useast1a.inbound.postmarkapp.com (Postfix) with ESMTPS id AB0FA453CA2',
      '\tfor <hussein@caime.test>; Thu, 15 Oct 2026 00:42:13 +0000 (UTC)',
      'Received: by mail-pl1-f174.google.com with SMTP id d9443c01a7336',
      '        for <hussein@caime.test>; Wed, 14 Oct 2026 17:42:13 -0700 (PDT)',
      'From: Hassan <h@datac.example>',
      '',
      'hi',
    ].join('\r\n');
    expect(receivingHop(top, POSTMARK)).toEqual({
      ip: '198.51.100.174',
      helo: 'mail-pl1-f174.google.com',
    });
    // The verdict line beside it is the payload's to say, never read: only the Received line is.
  });

  it('reads the connecting address from Postmark’s own line alone', async () => {
    expect(receivingHop(await mail(), POSTMARK)).toEqual({
      ip: SENDER_IP,
      helo: 'mail.partner.example',
    });
    const elsewhere =
      'Received: from x (x [203.0.113.9]) by mx.example.org with SMTP; Tue, 20 Oct 2026\r\nFrom: a@b.example\r\n\r\nhi';
    expect(receivingHop(elsewhere, POSTMARK)).toBeNull();
    const v6 =
      'Received: from x (x [IPv6:2001:db8::1])\r\n\tby p-pm-inbound01.mtasv.net with ESMTPS; Tue, 20 Oct 2026\r\n\r\nhi';
    expect(receivingHop(v6, POSTMARK)).toEqual({ ip: '2001:db8::1', helo: 'x' });
    // Past a hop between Postmark's own servers (a private address) to the one from outside.
    const internal =
      'Received: from edge01.inbound.postmarkapp.com (edge01 [10.1.2.3]) by p-pm-inbound02.mtasv.net with SMTP; Tue, 20 Oct 2026\r\n';
    const relayed = `${internal}${await mail({ dkim: 'none' })}`;
    expect(receivingHop(relayed, POSTMARK)).toEqual({
      ip: SENDER_IP,
      helo: 'mail.partner.example',
    });
    // An unsigned mail is vouched for by SPF for that address.
    expect(await verified(relayed)).toBe(true);
    // But never past it into a line Postmark didn't write.
    const internalOnly = `Received: from edge01 (edge01 [10.1.2.3]) by p-pm-inbound02.mtasv.net with SMTP; Tue, 20 Oct 2026\r\nReceived: from mail.partner.example (mail.partner.example [${SENDER_IP}]) by mx.partner.example with SMTP; Tue, 20 Oct 2026\r\nFrom: <sara@partner.example>\r\n\r\nhi`;
    expect(receivingHop(internalOnly, POSTMARK)).toBeNull();
  });
});
