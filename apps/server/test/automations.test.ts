import { SAVED_MAX, uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAutomations } from '../src/lib/automations';
import type { BusMessage } from '../src/lib/bus';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // keeps what her customers send
let cara: Client; // a customer of Noor's
let vic: Client; // a vendor
let stranger: Client;
let withCara: string;
let withVic: string;
/** A stranger's message request to Noor, and the one message it has. */
let request: { convo: string; messageId: string };

async function connect(a: Client, b: Client, sphere: string, role?: string) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere, ...(role ? { role } : {}) },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

async function upload(c: Client, name: string, mime = 'application/pdf', data?: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data ?? Buffer.from('%PDF-1.4 a small document'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string };
}

async function sendFile(c: Client, convo: string, name: string, body?: string) {
  const f = await upload(c, name);
  const sent = await c.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'file',
    ...(body ? { body } : {}),
    fileIds: [f.id],
  });
  await t.ctx.flush();
  return { message: sent.message, fileId: f.id };
}

const items = async (c: Client, collection?: string) =>
  (
    await c.get(
      `/v1/saved/items${collection ? `?collection=${encodeURIComponent(collection)}` : ''}`,
    )
  ).items as any[];

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  cara = await signup(t, { displayName: 'Cara Client' });
  vic = await signup(t, { displayName: 'Vic Vendor' });
  stranger = await signup(t, { displayName: 'Stan Ranger' });
  // Noor knows Cara as a customer and Vic as a vendor; they know her however they like.
  withCara = await connect(noor, cara, 'customer');
  withVic = await connect(noor, vic, 'vendor');
});
afterAll(async () => {
  await t.close();
});

describe('automations (PRD §69)', () => {
  let invoices: string;

  it('are set up by the person they act for, and say what they do in words', async () => {
    const made = await noor.req('POST', '/v1/automations', {
      when: { sphere: 'customer', kinds: ['document'], words: ['invoice', ' Invoice ', 'receipt'] },
      collection: '  Customer   Files ',
    });
    expect(made.statusCode).toBe(201);
    invoices = made.json().id;
    const { automations } = await noor.get('/v1/automations');
    expect(automations).toEqual([
      expect.objectContaining({
        id: invoices,
        enabled: true,
        runs: 0,
        collection: 'Customer Files',
        when: {
          sphere: 'customer',
          role: null,
          kinds: ['document'],
          words: ['invoice', 'receipt'],
        },
        description:
          'When a customer sends a file with “invoice” or “receipt”, save it to Customer Files',
      }),
    ]);
    // Nobody else's.
    expect((await cara.get('/v1/automations')).automations).toEqual([]);
    expect(
      (await cara.req('PATCH', `/v1/automations/${invoices}`, { enabled: false })).statusCode,
    ).toBe(404);
    expect((await cara.req('DELETE', `/v1/automations/${invoices}`)).statusCode).toBe(404);
    // A role needs a kind of relationship, and an automation keeps something.
    expect(
      (
        await noor.req('POST', '/v1/automations', {
          when: { role: 'manager', kinds: ['document'] },
          collection: 'x',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await noor.req('POST', '/v1/automations', { when: { kinds: [] }, collection: 'x' }))
        .statusCode,
    ).toBe(400);
    // Changed to it as it's typed, it's still the one they have.
    await noor.patch(`/v1/automations/${invoices}`, { collection: 'customer files' });
    expect((await noor.get('/v1/automations')).automations[0].collection).toBe('Customer Files');
    // Its collection is there before anything is in it.
    const { collections } = await noor.get('/v1/saved');
    expect(collections).toEqual([
      { name: 'Customer Files', count: 0, latestAt: null, automations: 1 },
    ]);
  });

  it('keep what a customer sends that matches, and nothing else', async () => {
    const sent = await sendFile(cara, withCara, 'INVOICE-0923.pdf');
    await sendFile(cara, withCara, 'scan.pdf', 'Here is your receipt for September');
    await sendFile(cara, withCara, 'menu.pdf', 'The menu for Friday');
    // A vendor's invoice isn't a customer's.
    await sendFile(vic, withVic, 'invoice-vic.pdf');
    // Noor's own invoices to Cara aren't kept for her by her automation.
    await sendFile(noor, withCara, 'invoice-to-cara.pdf');
    const kept = await items(noor, 'Customer Files');
    expect(kept.map((i) => i.files[0]?.name)).toEqual(['scan.pdf', 'INVOICE-0923.pdf']);
    expect(kept[1]).toMatchObject({
      collection: 'Customer Files',
      automationId: invoices,
      conversation: { id: withCara, kind: 'direct', title: null },
      message: { id: sent.message.id, senderId: cara.user.id, senderName: 'Cara Client' },
    });
    const { automations } = await noor.get('/v1/automations');
    expect(automations[0].runs).toBe(2);
    expect(automations[0].lastRunAt).not.toBeNull();
    // Cara has no automations: nothing is kept for her.
    expect(await items(cara)).toEqual([]);
  });

  it('once turned off, keep nothing more; what they kept stays', async () => {
    await noor.patch(`/v1/automations/${invoices}`, { enabled: false });
    await sendFile(cara, withCara, 'invoice-2.pdf');
    expect(await items(noor, 'Customer Files')).toHaveLength(2);
    await noor.patch(`/v1/automations/${invoices}`, { enabled: true });
  });

  it('never keep anything from a message request, nor across a block', async () => {
    await noor.post('/v1/automations', {
      when: { kinds: ['document'] },
      collection: 'Everything',
    });
    // A stranger's message request: nothing is kept until Noor accepts it.
    const dm = await stranger.post('/v1/conversations', { kind: 'direct', userId: noor.user.id });
    const sent = await sendFile(stranger, dm.conversation.id, 'invoice-from-a-stranger.pdf');
    request = { convo: dm.conversation.id, messageId: sent.message.id };
    expect(await items(noor, 'Everything')).toEqual([]);
    // Someone she's blocked keeps nothing coming, even in a group they share.
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Suppliers',
        memberIds: [cara.user.id, vic.user.id],
      })
    ).conversation.id;
    await noor.post('/v1/blocks', { userId: vic.user.id });
    await sendFile(vic, group, 'invoice-blocked.pdf').catch(() => null);
    expect((await items(noor, 'Everything')).map((i) => i.files[0]?.name)).not.toContain(
      'invoice-blocked.pdf',
    );
    await noor.del(`/v1/blocks/${vic.user.id}`);
    // In the group, anyone's file is kept by "anyone", and a customer's invoice by hers too.
    await sendFile(cara, group, 'invoice-in-group.pdf');
    const everything = await items(noor, 'Everything');
    expect(everything[0]).toMatchObject({
      conversation: { id: group, kind: 'group', title: 'Suppliers' },
      files: [expect.objectContaining({ name: 'invoice-in-group.pdf' })],
    });
    expect((await items(noor, 'Customer Files'))[0].files[0].name).toBe('invoice-in-group.pdf');
  });

  it('keep nothing from a private conversation', async () => {
    // Kept as it's said in a plain conversation, and never in a private one, whose messages are
    // sealed (here the same message, as if it had been said in one).
    const sent = await sendFile(vic, withVic, 'invoice-v.pdf');
    const kept = async () =>
      (await items(noor, 'Everything')).filter((i) => i.message.id === sent.message.id).length;
    expect(await kept()).toBe(1);
    await t.ctx.db.deleteFrom('saved_items').where('message_id', '=', sent.message.id).execute();
    const conversation = await t.ctx.db
      .selectFrom('conversations')
      .selectAll()
      .where('id', '=', withVic)
      .executeTakeFirstOrThrow();
    const message = await t.ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', sent.message.id)
      .executeTakeFirstOrThrow();
    const noorHere = [{ user_id: noor.user.id, request_state: null }];
    await runAutomations(t.ctx, { ...conversation, privacy_class: 'private' }, message, noorHere);
    expect(await kept()).toBe(0);
    await runAutomations(t.ctx, conversation, message, noorHere);
    expect(await kept()).toBe(1);
  });

  it('are at most fifty each, on Pro (Personal keeps five, R47)', async () => {
    // Pro keeps the most any plan does.
    await t.ctx.db
      .updateTable('users')
      .set({ plan: 'pro' })
      .where('id', '=', noor.user.id)
      .execute();
    const { automations } = await noor.get('/v1/automations');
    await t.ctx.db
      .insertInto('automations')
      .values(
        Array.from({ length: 49 - automations.length }, () => ({
          id: uuidv4(),
          user_id: noor.user.id,
          kinds: ['photo'],
          collection: 'Photos',
        })),
      )
      .execute();
    // With room for one, two added at once make fifty, never fifty-one.
    const both = await Promise.all(
      [1, 2].map(() =>
        noor.req('POST', '/v1/automations', { when: { kinds: ['photo'] }, collection: 'More' }),
      ),
    );
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 403]);
    expect((await noor.get('/v1/automations')).automations).toHaveLength(50);
    const res = await noor.req('POST', '/v1/automations', {
      when: { kinds: ['photo'] },
      collection: 'More',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({
      code: 'plan_limit',
      message: 'Pro keeps 50 automations. Remove one to add another.',
    });
    await t.ctx.db
      .deleteFrom('automations')
      .where('user_id', '=', noor.user.id)
      .where('collection', 'in', ['Photos', 'More'])
      .execute();
  });
});

describe('saving by hand, and what’s saved (PRD §69)', () => {
  let text: any;

  it('saves a message whole, once per collection, and lists it newest first', async () => {
    text = (
      await cara.post(`/v1/conversations/${withCara}/messages`, {
        clientId: uuidv4(),
        body: 'The venue address is 12 Nile St.',
      })
    ).message;
    const first = await noor.req('POST', `/v1/messages/${text.id}/save`, {});
    expect(first.statusCode).toBe(201);
    expect(first.json().collection).toBe('Saved');
    const again = await noor.req('POST', `/v1/messages/${text.id}/save`, {});
    expect(again.json()).toMatchObject({ id: first.json().id, existing: true });
    // The same message in another collection is another saved item.
    await noor.post(`/v1/messages/${text.id}/save`, { collection: 'Venues' });
    // Typed in another case or spacing, it's the collection they have, not a second one.
    expect(
      await noor.post(`/v1/messages/${text.id}/save`, { collection: '  venues ' }),
    ).toMatchObject({ collection: 'Venues', existing: true });
    const [saved] = await items(noor, 'Saved');
    expect(saved).toMatchObject({
      automationId: null,
      message: { id: text.id, body: 'The venue address is 12 Nile St.', kind: 'text' },
      files: [],
      link: null,
    });
    const { collections, total, max } = await noor.get('/v1/saved');
    expect(max).toBe(SAVED_MAX);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(collections.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(['Saved', 'Venues', 'Customer Files', 'Everything']),
    );
  });

  it('saves one file of a message, and refuses what isn’t theirs to save', async () => {
    const sent = await sendFile(cara, withCara, 'floorplan.pdf');
    const asset = (
      await noor.get(`/v1/conversations/${withCara}/assets?kind=document`)
    ).assets.find((a: any) => a.messageId === sent.message.id);
    await noor.post(`/v1/messages/${sent.message.id}/save`, {
      collection: 'Venues',
      assetId: asset.id,
    });
    expect((await items(noor, 'Venues'))[0].files.map((f: any) => f.name)).toEqual([
      'floorplan.pdf',
    ]);
    // Another message's file, a message they're not in, a line about the conversation.
    expect(
      (
        await noor.req('POST', `/v1/messages/${text.id}/save`, {
          assetId: asset.id,
        })
      ).statusCode,
    ).toBe(404);
    expect((await stranger.req('POST', `/v1/messages/${text.id}/save`, {})).statusCode).toBe(404);
  });

  it('moves, renames and removes, and a collection an automation uses stays', async () => {
    const [venue] = await items(noor, 'Venues');
    // Moved or renamed to a collection as it's typed, it's the one they have.
    await noor.patch(`/v1/saved/${venue.id}`, { collection: 'saved' });
    expect((await items(noor, 'Saved')).map((i) => i.id)).toContain(venue.id);
    // Renamed into one that exists, the two are one, and nothing is in it twice.
    await noor.post('/v1/saved/collections/rename', { from: 'Venues', to: 'SAVED' });
    const saved = await items(noor, 'Saved');
    expect(new Set(saved.map((i) => `${i.message.id}:${i.files[0]?.id ?? ''}`)).size).toBe(
      saved.length,
    );
    expect(await items(noor, 'Venues')).toEqual([]);
    const names = (await noor.get('/v1/saved')).collections.map((c: any) => c.name);
    expect(names.filter((n: string) => n.toLowerCase() === 'saved')).toEqual(['Saved']);
    // An automation's collection is renamed with it, and isn't removed while it's used.
    await noor.post('/v1/saved/collections/rename', { from: 'Customer Files', to: 'clients' });
    // Renamed to its own name in another case, it's written as asked.
    await noor.post('/v1/saved/collections/rename', { from: 'clients', to: 'Clients' });
    expect((await noor.get('/v1/automations')).automations.map((a: any) => a.collection)).toEqual([
      'Clients',
      'Everything',
    ]);
    const refused = await noor.req('DELETE', '/v1/saved/collections?name=Clients');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('collection_in_use');
    await noor.del('/v1/saved/collections?name=Saved');
    expect(await items(noor, 'Saved')).toEqual([]);
    const [one] = await items(noor, 'Clients');
    expect((await cara.req('DELETE', `/v1/saved/${one.id}`)).statusCode).toBe(404);
    await noor.del(`/v1/saved/${one.id}`);
    expect((await items(noor, 'Clients')).map((i) => i.id)).not.toContain(one.id);
  });

  it('goes when the message goes: deleted for everyone, for oneself, or out of the conversation', async () => {
    const a = await sendFile(cara, withCara, 'invoice-a.pdf');
    const b = await sendFile(cara, withCara, 'invoice-b.pdf');
    const ids = async () => (await items(noor, 'Clients')).map((i) => i.message.id);
    expect(await ids()).toEqual(expect.arrayContaining([a.message.id, b.message.id]));
    // Kept whole by hand as well as its file by the automation.
    await noor.post(`/v1/messages/${a.message.id}/save`, { collection: 'Whole' });
    await cara.del(`/v1/messages/${a.message.id}`);
    expect(await ids()).not.toContain(a.message.id);
    // Gone, not only out of sight: it no longer counts toward what Noor has room for.
    const rows = await t.ctx.db
      .selectFrom('saved_items')
      .select('id')
      .where('message_id', '=', a.message.id)
      .execute();
    expect(rows).toEqual([]);
    await noor.del(`/v1/messages/${b.message.id}?forEveryone=false`);
    expect(await ids()).not.toContain(b.message.id);
    // Deleted for oneself, it can't be saved again either.
    expect((await noor.req('POST', `/v1/messages/${b.message.id}/save`, {})).statusCode).toBe(404);
    // Out of a group, nothing of it shows in what she saved.
    const club = (
      await cara.post('/v1/conversations', {
        kind: 'group',
        title: 'Book club',
        memberIds: [noor.user.id],
      })
    ).conversation.id;
    const said = (
      await cara.post(`/v1/conversations/${club}/messages`, {
        clientId: uuidv4(),
        body: 'Next: Middlemarch',
      })
    ).message;
    await noor.post(`/v1/messages/${said.id}/save`, { collection: 'Books' });
    expect((await items(noor, 'Books')).map((i) => i.message.id)).toEqual([said.id]);
    const before = (await noor.get('/v1/saved')).total;
    await noor.del(`/v1/conversations/${club}/members/${noor.user.id}`);
    expect(await items(noor, 'Books')).toEqual([]);
    // Nor does it count toward what she has room for: nothing she can't see or remove fills it.
    expect((await noor.get('/v1/saved')).total).toBe(before - 1);
    // Deleted for herself while an automation was keeping it: never listed, whichever was first.
    const c = await sendFile(cara, withCara, 'invoice-c.pdf');
    expect(await ids()).toContain(c.message.id);
    const counted = (await noor.get('/v1/saved')).total;
    const keptOfIt = await t.ctx.db
      .selectFrom('saved_items')
      .select('id')
      .where('message_id', '=', c.message.id)
      .where('user_id', '=', noor.user.id)
      .execute();
    expect(keptOfIt.length).toBeGreaterThan(0);
    await t.ctx.db
      .insertInto('hidden_messages')
      .values({ message_id: c.message.id, user_id: noor.user.id })
      .execute();
    expect(await ids()).not.toContain(c.message.id);
    expect((await noor.get('/v1/saved')).total).toBe(counted - keptOfIt.length);
  });

  it('refuses a private conversation, a request not yet accepted, and past the most there’s room for', async () => {
    // (A private conversation's messages are sealed: this one is made private after it's said.)
    const m = (
      await vic.post(`/v1/conversations/${withVic}/messages`, {
        clientId: uuidv4(),
        body: 'hello',
      })
    ).message;
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'private' })
      .where('id', '=', withVic)
      .execute();
    expect((await noor.req('POST', `/v1/messages/${m.id}/save`, {})).statusCode).toBe(403);
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'standard' })
      .where('id', '=', withVic)
      .execute();
    const r = await noor.req('POST', `/v1/messages/${request.messageId}/save`, {});
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('awaiting_acceptance');
    // Full: nothing more is saved, by hand or by an automation.
    const room = SAVED_MAX - (await noor.get('/v1/saved')).total;
    await t.ctx.db
      .insertInto('saved_items')
      .values(
        Array.from({ length: room - 1 }, () => ({
          id: uuidv4(),
          user_id: noor.user.id,
          collection: 'Filler',
          conversation_id: withCara,
          message_id: text.id,
          asset_id: null,
        })).map((row, i) => ({ ...row, collection: `Filler ${i}` })),
      )
      .execute();
    // With room for one, two saved at once make the most, never one more.
    const both = await Promise.all(
      ['Both A', 'Both B'].map((collection) =>
        noor.req('POST', `/v1/messages/${text.id}/save`, { collection }),
      ),
    );
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await noor.get('/v1/saved')).total).toBe(SAVED_MAX);
    const full = await noor.req('POST', `/v1/messages/${text.id}/save`, { collection: 'Last' });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('saved_full');
    const before = (await noor.get('/v1/saved')).total;
    await sendFile(cara, withCara, 'invoice-full.pdf');
    expect((await noor.get('/v1/saved')).total).toBe(before);
  });
});

describe('automations in a conversation with an organization', () => {
  it('to its team the other side is a customer, and to the customer an organization', async () => {
    const owner = await signup(t, { displayName: 'Olivia Owner' });
    const omar = await signup(t, { displayName: 'Omar Team' });
    const lina = await signup(t, { displayName: 'Lina Buyer' });
    await connect(owner, omar, 'work');
    const org = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Acme Parts',
        handle: 'acme.parts',
        kind: 'business',
      })
    ).org.id;
    await owner.post(`/v1/orgs/${org}/members`, { userIds: [omar.user.id] });
    const convo = (await lina.post(`/v1/orgs/${org}/conversations`)).conversationId as string;
    await omar.post('/v1/automations', {
      when: { sphere: 'customer', kinds: ['document'] },
      collection: 'Orders',
    });
    await lina.post('/v1/automations', {
      when: { sphere: 'organization', kinds: ['document'], words: ['invoice'] },
      collection: 'Bills',
    });
    // Another of the team keeps what customers send, never what her own side does.
    await owner.post('/v1/automations', {
      when: { sphere: 'customer', kinds: ['document'] },
      collection: 'Customer Files',
    });
    await sendFile(lina, convo, 'order-17.pdf');
    await sendFile(omar, convo, 'invoice-17.pdf');
    expect((await items(owner, 'Customer Files')).map((i) => i.files[0]?.name)).toEqual([
      'order-17.pdf',
    ]);
    const [order] = await items(omar, 'Orders');
    expect(order).toMatchObject({
      files: [expect.objectContaining({ name: 'order-17.pdf' })],
      message: { senderId: lina.user.id, senderName: 'Lina Buyer' },
    });
    // The customer is never told who on the team sent it.
    const [bill] = await items(lina, 'Bills');
    expect(bill).toMatchObject({
      files: [expect.objectContaining({ name: 'invoice-17.pdf' })],
      conversation: { id: convo, kind: 'business', title: 'Acme Parts' },
      message: { senderId: org, senderName: 'Acme Parts' },
    });
    expect(JSON.stringify(bill)).not.toContain(omar.user.id);
    expect(JSON.stringify(bill)).not.toContain('Omar');
    // Only one's own is kept for one: the invoice isn't an order.
    expect(await items(omar, 'Orders')).toHaveLength(1);
    // Lina once blocked Omar: what the organization sends is kept whoever on it wrote, so
    // what's missing never says who that was.
    await lina.post('/v1/blocks', { userId: omar.user.id });
    await sendFile(owner, convo, 'invoice-q1.pdf');
    await sendFile(omar, convo, 'invoice-q2.pdf');
    expect((await items(lina, 'Bills')).map((i) => i.files[0]?.name)).toEqual([
      'invoice-q2.pdf',
      'invoice-q1.pdf',
      'invoice-17.pdf',
    ]);
    // And the team keeps nothing of each other's.
    expect(await items(owner, 'Customer Files')).toHaveLength(1);
    await lina.del(`/v1/blocks/${omar.user.id}`);
  });
});

describe('every device catches up with what’s saved', () => {
  it('is told when an automation keeps something, and when what they saved goes', async () => {
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    const told = async (type: string, userId: string) => {
      for (let i = 0; i < 300; i++) {
        if (heard.some((m) => m.event.type === type && m.userIds.includes(userId))) return true;
        await new Promise((r) => setTimeout(r, 10));
      }
      return false;
    };
    try {
      const ada = await signup(t, { displayName: 'Ada Keeper' });
      const ben = await signup(t, { displayName: 'Ben Sender' });
      const direct = await connect(ada, ben, 'friend');
      await ada.post('/v1/automations', { when: { kinds: ['document'] }, collection: 'Files' });
      // (Making it says so too: heard, then set aside.)
      expect(await told('automations.changed', ada.user.id)).toBe(true);
      await busSettled(t, heard);
      heard.length = 0;
      // Kept: what's saved and the automation's count, on each of her devices.
      await sendFile(ben, direct, 'notes.pdf');
      expect(await told('automations.changed', ada.user.id)).toBe(true);
      // A photo she saved from an album goes when it's taken out of the album.
      const card = (
        await ben.post(`/v1/conversations/${direct}/messages`, {
          clientId: uuidv4(),
          kind: 'kit',
          payload: { kit: 'shared_album', fields: { title: 'Trip' } },
        })
      ).message;
      const jpeg = await sharp({
        create: { width: 32, height: 24, channels: 3, background: '#3a86ff' },
      })
        .jpeg()
        .toBuffer();
      const pic = await upload(ben, 'beach.jpg', 'image/jpeg', jpeg);
      await ben.post(`/v1/messages/${card.id}/album`, { fileIds: [pic.id] });
      const asset = await t.ctx.db
        .selectFrom('assets')
        .select('id')
        .where('message_id', '=', card.id)
        .where('file_id', '=', pic.id)
        .executeTakeFirstOrThrow();
      await ada.post(`/v1/messages/${card.id}/save`, { collection: 'Trip', assetId: asset.id });
      expect(await items(ada, 'Trip')).toHaveLength(1);
      await busSettled(t, heard);
      heard.length = 0;
      await ben.del(`/v1/messages/${card.id}/album/${pic.id}`);
      expect(await told('saved.changed', ada.user.id)).toBe(true);
      expect(await items(ada, 'Trip')).toEqual([]);
      // Out of a group, what she saved of it goes from her lists at once.
      const group = (
        await ben.post('/v1/conversations', {
          kind: 'group',
          title: 'Reading',
          memberIds: [ada.user.id],
        })
      ).conversation.id;
      const said = (
        await ben.post(`/v1/conversations/${group}/messages`, {
          clientId: uuidv4(),
          body: 'Chapter 3 by Friday',
        })
      ).message;
      await ada.post(`/v1/messages/${said.id}/save`, { collection: 'Reading' });
      await busSettled(t, heard);
      heard.length = 0;
      await ada.del(`/v1/conversations/${group}/members/${ada.user.id}`);
      expect(await told('saved.changed', ada.user.id)).toBe(true);
    } finally {
      stop();
    }
  });
});
