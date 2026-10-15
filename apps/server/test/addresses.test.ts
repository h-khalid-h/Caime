/**
 * Someone's own addresses (R91): an email or a phone number added as theirs counts for nothing
 * until a code sent to it comes back (by mail, by WhatsApp: a stand-in answers Meta's API).
 * Proven, it's that person's alone, people who have it find them by it as by their sign-in,
 * and it travels with their data.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ADDRESS_CODE_TRIES, ADDRESSES_MAX, addressValue } from '@caime/core/addresses';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let bare: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let stub: Server;
let sent: Array<{ path: string; auth?: string; body: any }> = [];
let refuse = false;
let noor: Client;
let omar: Client;
let sara: Client;

const codeIn = (text: string) => /is (\d{6})/.exec(text)?.[1] ?? '';
const lastCodeTo = async (to: string) => {
  await t.ctx.flush();
  const m = mail.outbox.filter((x) => x.to === to).at(-1);
  return m ? codeIn(m.text) : '';
};
const lastWhatsAppCode = () => sent.at(-1)?.body.template.components[0].parameters[0].text;

beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      sent.push({ path: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(refuse ? 400 : 200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(refuse ? { error: { code: 131026 } } : { messages: [{ id: 'wamid.1' }] }),
      );
    });
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  const port = (stub.address() as AddressInfo).port;
  mail = memoryMailer();
  t = await createTestApp(
    {
      WHATSAPP_API: `http://127.0.0.1:${port}/v21.0`,
      WHATSAPP_TOKEN: 'a-whatsapp-token-for-tests',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    },
    { mail },
  );
  bare = await createTestApp({}, { mail: memoryMailer() });
  noor = await signup(t, { displayName: 'Noor Haddad', email: 'noor@example.com' });
  omar = await signup(t, { displayName: 'Omar Haddad', email: 'omar@example.com' });
  sara = await signup(t, { displayName: 'Sara Haddad', email: 'sara@example.com' });
});

afterAll(async () => {
  await t.close();
  await bare.close();
  await new Promise((r) => stub.close(r));
});

describe('addressValue', () => {
  it('keeps an email lower-cased and a number in E.164', () => {
    expect(addressValue('email', ' Noor@Work.Example ')).toBe('noor@work.example');
    expect(addressValue('email', 'not an address')).toBeNull();
    expect(addressValue('phone', '+20 101 315-2969')).toBe('+201013152969');
    expect(addressValue('phone', '00201013152969')).toBe('+201013152969');
    expect(addressValue('phone', '0101 315 2969')).toBeNull();
  });
});

describe('an email of one’s own', () => {
  it('is proven by a code sent to it, and only then counts', async () => {
    const add = await noor.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'Noor@Work.Example',
    });
    expect(add.statusCode).toBe(201);
    const { address } = add.json();
    expect(address).toMatchObject({ kind: 'email', value: 'noor@work.example', verified: false });
    const code = await lastCodeTo('noor@work.example');
    expect(code).toMatch(/^\d{6}$/);
    // The log names the kind of mail, never its subject (which carries the code).
    expect(mail.outbox.at(-1)?.kind).toBe('address');

    // Unproven, nobody finds Noor by it.
    await noor.req('PUT', '/v1/me/privacy', { discoverByEmail: true });
    const before = await omar.post('/v1/people/match', { emails: ['noor@work.example'] });
    expect(before.matches).toEqual([]);

    const wrong = await noor.req('POST', `/v1/me/addresses/${address.id}/verify`, {
      code: code === '000000' ? '111111' : '000000',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('wrong_code');
    const right = await noor.post(`/v1/me/addresses/${address.id}/verify`, { code });
    expect(right.address).toMatchObject({ verified: true, method: 'email' });

    const list = await noor.get('/v1/me/addresses');
    expect(list.addresses).toEqual([expect.objectContaining({ value: 'noor@work.example' })]);
    expect(list.phoneBy).toEqual(['whatsapp']);

    // Proven, it finds Noor as her sign-in does: in a contacts file and in search.
    const after = await omar.post('/v1/people/match', { emails: ['noor@work.example'] });
    expect(after.matches).toEqual([
      expect.objectContaining({
        email: 'noor@work.example',
        person: expect.objectContaining({ id: noor.user.id }),
      }),
    ]);
    const found = await omar.get('/v1/people/search?q=NOOR@work.example');
    expect(found.results.map((r: { person: { id: string } }) => r.person.id)).toContain(
      noor.user.id,
    );
    // Nothing of a match says her other address.
    expect(JSON.stringify(after)).not.toContain('noor@example.com');

    // It travels with her data.
    const archive = (await noor.req('GET', '/v1/me/export')).json();
    expect(JSON.stringify(archive)).toContain('noor@work.example');
  });

  it('is one person’s alone: someone else’s proven one, or sign-in, is refused at once', async () => {
    const theirs = await omar.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'noor@work.example',
    });
    expect(theirs.statusCode).toBe(409);
    expect(theirs.json().error.code).toBe('email_taken');
    const signIn = await omar.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'sara@example.com',
    });
    expect(signIn.statusCode).toBe(409);
    const own = await noor.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'noor@example.com',
    });
    expect(own.statusCode).toBe(409);
    // Nobody was sent a code for any of them.
    await t.ctx.flush();
    expect(mail.outbox.filter((m) => m.to === 'sara@example.com' && m.kind === 'address')).toEqual(
      [],
    );
  });

  it('goes to whoever proves it first, when two asked for it', async () => {
    const a = (await omar.post('/v1/me/addresses', { kind: 'email', value: 'shared@example.com' }))
      .address;
    const omarCode = await lastCodeTo('shared@example.com');
    const b = (await sara.post('/v1/me/addresses', { kind: 'email', value: 'shared@example.com' }))
      .address;
    const saraCode = await lastCodeTo('shared@example.com');
    expect(
      (await sara.post(`/v1/me/addresses/${b.id}/verify`, { code: saraCode })).address,
    ).toMatchObject({ verified: true });
    const late = await omar.req('POST', `/v1/me/addresses/${a.id}/verify`, { code: omarCode });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('email_taken');
  });

  it('takes five tries, runs out in ten minutes, and a new code starts again', async () => {
    const { address } = await sara.post('/v1/me/addresses', {
      kind: 'email',
      value: 'sara@home.example',
    });
    const code = await lastCodeTo('sara@home.example');
    const bad = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < ADDRESS_CODE_TRIES; i++)
      await sara.req('POST', `/v1/me/addresses/${address.id}/verify`, { code: bad });
    const spent = await sara.req('POST', `/v1/me/addresses/${address.id}/verify`, { code });
    expect(spent.json().error.code).toBe('code_expired');

    // Asking again sends a new code, which works.
    await sara.post('/v1/me/addresses', { kind: 'email', value: 'sara@home.example' });
    const again = await lastCodeTo('sara@home.example');
    t.clock.advance(11 * 60_000);
    const late = await sara.req('POST', `/v1/me/addresses/${address.id}/verify`, { code: again });
    expect(late.json().error.code).toBe('code_expired');
    await sara.post('/v1/me/addresses', { kind: 'email', value: 'sara@home.example' });
    const third = await lastCodeTo('sara@home.example');
    expect(
      (await sara.post(`/v1/me/addresses/${address.id}/verify`, { code: third })).address.verified,
    ).toBe(true);
    // Still one row: asking again never adds another.
    const list = await sara.get('/v1/me/addresses');
    expect(
      list.addresses.filter((a: { value: string }) => a.value === 'sara@home.example'),
    ).toHaveLength(1);
  });

  it('is at most five of a kind, and removing one makes room', async () => {
    const who = await signup(t, { displayName: 'Many Addresses' });
    const ids: string[] = [];
    for (let i = 0; i < ADDRESSES_MAX; i++)
      ids.push(
        (await who.post('/v1/me/addresses', { kind: 'email', value: `m${i}@example.org` })).address
          .id,
      );
    const over = await who.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'one-more@example.org',
    });
    expect(over.statusCode).toBe(400);
    expect((await who.req('DELETE', `/v1/me/addresses/${ids[0]}`)).statusCode).toBe(200);
    expect(
      (
        await who.req('POST', '/v1/me/addresses', {
          kind: 'email',
          value: 'one-more@example.org',
        })
      ).statusCode,
    ).toBe(201);
    // Nobody else's to remove.
    expect((await noor.req('DELETE', `/v1/me/addresses/${ids[1]}`)).statusCode).toBe(404);
  });
});

describe('a phone number of one’s own', () => {
  it('is proven by a code over WhatsApp, with the approved template', async () => {
    sent = [];
    const { address } = await noor.post('/v1/me/addresses', {
      kind: 'phone',
      value: '+20 101 315 2969',
    });
    expect(address).toMatchObject({ kind: 'phone', value: '+201013152969', verified: false });
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call?.path).toBe('/v21.0/1234567890/messages');
    expect(call?.auth).toBe('Bearer a-whatsapp-token-for-tests');
    const body = call?.body;
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '201013152969',
      type: 'template',
      template: { name: 'caime_code', language: { code: 'en_US' } },
    });
    const code = lastWhatsAppCode();
    // The code is in the body and in the copy-code button alike.
    expect(body.template.components[1]).toMatchObject({
      type: 'button',
      parameters: [{ type: 'text', text: code }],
    });
    const done = await noor.post(`/v1/me/addresses/${address.id}/verify`, { code });
    expect(done.address).toMatchObject({ verified: true, method: 'whatsapp' });

    const taken = await omar.req('POST', '/v1/me/addresses', {
      kind: 'phone',
      value: '00201013152969',
    });
    expect(taken.json().error.code).toBe('phone_taken');
  });

  it('says so when WhatsApp refuses, and when nothing can send', async () => {
    refuse = true;
    const failed = await omar.req('POST', '/v1/me/addresses', {
      kind: 'phone',
      value: '+447700900123',
    });
    refuse = false;
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('provider_failed');

    const someone = await signup(bare, { displayName: 'No WhatsApp Here' });
    expect((await someone.get('/v1/me/addresses')).phoneBy).toEqual([]);
    const off = await someone.req('POST', '/v1/me/addresses', {
      kind: 'phone',
      value: '+447700900124',
    });
    expect(off.statusCode).toBe(503);
    expect(off.json().error.code).toBe('phone_unavailable');
    const bad = await someone.req('POST', '/v1/me/addresses', { kind: 'phone', value: '0101' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('a deleted account', () => {
  it('takes its addresses with it, so another may prove them', async () => {
    const leaving = await signup(t, { displayName: 'Leaving Soon' });
    const { address } = await leaving.post('/v1/me/addresses', {
      kind: 'email',
      value: 'gone@example.net',
    });
    await leaving.post(`/v1/me/addresses/${address.id}/verify`, {
      code: await lastCodeTo('gone@example.net'),
    });
    await leaving.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    const next = await omar.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: 'gone@example.net',
    });
    expect(next.statusCode).toBe(201);
  });
});
