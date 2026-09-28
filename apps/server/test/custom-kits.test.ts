import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner of Tiles Co
let omar: Client; // on its team
let lina: Client; // a customer
let rami: Client; // a customer under 18
let orgId: string;
let otherOrgId: string; // Omar's own shop
let convo: string; // Lina and Tiles Co
let ramiConvo: string; // Rami and Tiles Co
let otherConvo: string; // Lina and another shop
let direct: string; // Noor and Omar
/** Tiles Co's pharmacy app, its second app, and one that may not make cards. */
const apps = {} as Record<'pharmacy' | 'second' | 'plain', { id: string; token: string }>;
const HOOK = 'http://127.0.0.1:9/caime';

const as = (
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(body !== undefined ? { payload: body as object } : {}),
  });

const PRESCRIPTION = {
  name: 'Prescription',
  description: 'A prescription, and when it’s ready',
  fields: [
    { key: 'medicine', label: 'Medicine', type: 'text', required: true },
    { key: 'notes', label: 'Notes', type: 'longtext' },
    { key: 'readyBy', label: 'Ready by', type: 'datetime' },
  ],
  states: [
    { id: 'preparing', label: 'Being prepared' },
    { id: 'ready', label: 'Ready to collect', tone: 'positive' },
    { id: 'collected', label: 'Collected', tone: 'positive' },
  ],
  moves: [
    { from: 'preparing', to: 'ready', label: 'Mark ready', who: 'organization' },
    { from: 'ready', to: 'collected', label: 'I collected it', who: 'customer' },
  ],
};

const card = (fields: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  clientId: uuidv4(),
  kind: 'kit',
  payload: { kit: 'custom', key: 'prescription', fields, ...extra },
});

async function send(token: string, conversationId: string, body: unknown) {
  const res = await as(token, 'POST', `/v1/conversations/${conversationId}/messages`, body);
  return { res, message: res.json().message };
}

/** What each app was told, oldest first. */
const told = async (appId: string, event?: string) =>
  (
    await t.ctx.db
      .selectFrom('webhook_deliveries')
      .select(['event', 'payload'])
      .where('app_id', '=', appId)
      .orderBy('created_at')
      .orderBy('id')
      .execute()
  )
    .filter((d) => !event || d.event === event)
    .map((d) => (d.payload as { data: Record<string, unknown> }).data);

async function makeApp(name: string, scopes: string[]) {
  const made = await noor.req('POST', `/v1/orgs/${orgId}/apps`, {
    name,
    scopes,
    webhookUrl: HOOK,
    events: ['kit.posted', 'kit.moved'],
  });
  expect(made.statusCode, made.body).toBe(201);
  return { id: made.json().app.id as string, token: made.json().token as string };
}

beforeAll(async () => {
  t = await createTestApp({ WEBHOOKS_ALLOW_PRIVATE: 'true' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  rami = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  direct = (await noor.post('/v1/conversations', { kind: 'direct', userId: omar.user.id }))
    .conversation.id;
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Tiles Co',
      handle: 'tiles.co',
      kind: 'shop',
    })
  ).org.id;
  otherOrgId = (
    await omar.post('/v1/orgs', {
      country: 'EG',
      name: 'Other Shop',
      handle: 'other.shop',
      kind: 'shop',
    })
  ).org.id;
  // On Business, for more than one app, and verified, so someone under 18 may write to it.
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business', domain: 'tiles.example', verified_at: t.ctx.now() })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  ramiConvo = (await rami.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  otherConvo = (await lina.post(`/v1/orgs/${otherOrgId}/conversations`)).conversationId;
  apps.pharmacy = await makeApp('Nile Pharmacy', ['messages:read', 'messages:write', 'kits']);
  apps.second = await makeApp('Second App', ['messages:write', 'kits']);
  apps.plain = await makeApp('Plain App', ['messages:write']);
});

afterAll(async () => {
  await t.close();
});

describe('an app’s own kinds of card (PRD §74, §86)', () => {
  it('are kept by the app, through its own token only', async () => {
    const made = await as(apps.pharmacy.token, 'PUT', '/v1/kits/prescription', PRESCRIPTION);
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json().kit).toMatchObject({
      key: 'prescription',
      name: 'Prescription',
      icon: 'clipboard-list',
      adultsOnly: false,
      states: [
        { id: 'preparing', label: 'Being prepared', tone: 'neutral' },
        { id: 'ready', label: 'Ready to collect', tone: 'positive' },
        { id: 'collected', label: 'Collected', tone: 'positive' },
      ],
    });
    // Replaced whole, under the same key.
    const again = await as(apps.pharmacy.token, 'PUT', '/v1/kits/prescription', PRESCRIPTION);
    expect(again.statusCode).toBe(200);
    const listed = await as(apps.pharmacy.token, 'GET', '/v1/kits');
    expect(listed.json().kits.map((k: { key: string }) => k.key)).toEqual(['prescription']);
    // Another app of the organization has its own, none of these.
    expect((await as(apps.second.token, 'GET', '/v1/kits')).json().kits).toEqual([]);

    const noScope = await as(apps.plain.token, 'PUT', '/v1/kits/prescription', PRESCRIPTION);
    expect(noScope.statusCode).toBe(403);
    expect(noScope.json().error.code).toBe('token_scope');
    const person = await noor.req('PUT', '/v1/kits/prescription', PRESCRIPTION);
    expect(person.statusCode).toBe(403);
    expect(person.json().error.message).toBe('Only an app’s token does this.');

    const wrong = await as(apps.pharmacy.token, 'PUT', '/v1/kits/prescription', {
      ...PRESCRIPTION,
      moves: [{ from: 'preparing', to: 'shipped', label: 'Ship', who: 'organization' }],
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.message).toBe('Move 1: it goes to another of the kit’s states.');

    // Its owners see what it has made, on the app's sheet.
    const { apps: views } = await noor.get(`/v1/orgs/${orgId}/apps`);
    expect(views.find((a: { id: string }) => a.id === apps.pharmacy.id).kits).toEqual([
      { key: 'prescription', name: 'Prescription' },
    ]);
    const saved = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', apps.pharmacy.id)
      .where('action', '=', 'app.kit_saved')
      .execute();
    expect(saved).toHaveLength(2);
  });

  it('are up to 20 for each app', async () => {
    for (let i = 0; i < 19; i++) {
      const res = await as(apps.second.token, 'PUT', `/v1/kits/k${i}`, PRESCRIPTION);
      expect(res.statusCode, res.body).toBe(201);
    }
    expect((await as(apps.second.token, 'PUT', '/v1/kits/k19', PRESCRIPTION)).statusCode).toBe(201);
    const over = await as(apps.second.token, 'PUT', '/v1/kits/k20', PRESCRIPTION);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.message).toMatch(/up to 20 kinds of card/);
    // Replacing one isn't making another.
    expect((await as(apps.second.token, 'PUT', '/v1/kits/k0', PRESCRIPTION)).statusCode).toBe(200);
    for (let i = 0; i < 20; i++)
      expect((await as(apps.second.token, 'DELETE', `/v1/kits/k${i}`)).statusCode).toBe(200);
    expect((await as(apps.second.token, 'DELETE', '/v1/kits/k0')).statusCode).toBe(404);
  });

  it('are sent by their app in its organization’s conversations, each card keeping its kit', async () => {
    const { res, message } = await send(
      apps.pharmacy.token,
      convo,
      card({ medicine: 'Amoxicillin', readyBy: { at: '2026-10-02T13:00:00Z', hasTime: true } }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect(message.payload).toMatchObject({
      kit: 'custom',
      app: { id: apps.pharmacy.id, name: 'Nile Pharmacy' },
      key: 'prescription',
      label: 'Prescription',
      icon: 'clipboard-list',
      title: 'Amoxicillin',
      state: 'preparing',
      fields: {
        medicine: 'Amoxicillin',
        readyBy: { at: '2026-10-02T13:00:00.000Z', hasTime: true },
      },
      def: { states: PRESCRIPTION.states.map((s) => expect.objectContaining({ id: s.id })) },
    });
    // The customer reads it as sent.
    const page = await lina.get(`/v1/conversations/${convo}/messages`);
    expect(page.messages.find((m: { id: string }) => m.id === message.id).payload).toEqual(
      message.payload,
    );
    // The app sent it itself: it isn't told what it did.
    expect(await told(apps.pharmacy.id)).toEqual([]);
  });

  it('are sent by nobody else, and nowhere else', async () => {
    const elsewhere = await send(apps.pharmacy.token, otherConvo, card({ medicine: 'A' }));
    expect(elsewhere.res.statusCode).toBe(404);
    const noScope = await send(apps.plain.token, convo, card({ medicine: 'A' }));
    expect(noScope.res.statusCode).toBe(403);
    expect(noScope.res.json().error.code).toBe('token_scope');
    const unknown = await send(
      apps.pharmacy.token,
      convo,
      card({ medicine: 'A' }, { key: 'nope' }),
    );
    expect(unknown.res.statusCode).toBe(400);
    expect(unknown.res.json().error.message).toBe('That card isn’t available here.');
    const empty = await send(apps.pharmacy.token, convo, card({ notes: 'Twice a day' }));
    expect(empty.res.statusCode).toBe(400);
    expect(empty.res.json().error.message).toBe('Medicine is needed.');
    // An app sends only its own kinds of card, whatever it names.
    const theirs = await send(
      apps.second.token,
      convo,
      card({ medicine: 'A' }, { app: apps.pharmacy.id }),
    );
    expect(theirs.res.statusCode).toBe(403);
    expect(theirs.res.json().error.message).toBe('An app sends only its own cards.');
    // The customer never sends the organization's cards.
    const customer = await lina.req(
      'POST',
      `/v1/conversations/${convo}/messages`,
      card({ medicine: 'A' }, { app: apps.pharmacy.id }),
    );
    expect(customer.statusCode).toBe(403);
    expect(customer.json().error.message).toBe('Only the organization sends its cards.');
    // Nor another organization's, by someone on both teams.
    const theirs2 = await omar.req('POST', `/v1/orgs/${otherOrgId}/apps`, {
      name: 'Other Shop App',
      scopes: ['kits'],
    });
    expect(theirs2.statusCode).toBe(201);
    expect(
      (await as(theirs2.json().token, 'PUT', '/v1/kits/prescription', PRESCRIPTION)).statusCode,
    ).toBe(201);
    const crossed = await omar.req(
      'POST',
      `/v1/conversations/${convo}/messages`,
      card({ medicine: 'A' }, { app: theirs2.json().app.id }),
    );
    expect(crossed.statusCode).toBe(400);
    expect(crossed.json().error.message).toBe('That card isn’t available here.');
    // Nor are they for conversations that aren't with the organization.
    const personal = await noor.req(
      'POST',
      `/v1/conversations/${direct}/messages`,
      card({ medicine: 'A' }, { app: apps.pharmacy.id }),
    );
    expect(personal.statusCode).toBe(400);
    expect(personal.json().error.message).toBe(
      'An organization’s own cards are for conversations with it.',
    );
  });

  it('move as their kit says, each side its own moves, and their app hears who moved them', async () => {
    const { message } = await send(apps.pharmacy.token, convo, card({ medicine: 'Ibuprofen' }));
    const customerFirst = await lina.req('POST', `/v1/messages/${message.id}/kit`, { to: 'ready' });
    expect(customerFirst.statusCode).toBe(403);
    const ready = await omar.req('POST', `/v1/messages/${message.id}/kit`, { to: 'ready' });
    expect(ready.statusCode, ready.body).toBe(200);
    expect(ready.json().message.payload).toMatchObject({
      state: 'ready',
      history: [{ state: 'ready', by: omar.user.id }],
    });
    // The customer hears the organization, in the kit's own words.
    const heard = await t.ctx.db
      .selectFrom('notifications')
      .select(['title', 'body'])
      .where('user_id', '=', lina.user.id)
      .where('kind', '=', 'kit')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(heard).toEqual({
      title: 'Tiles Co: Ready to collect',
      body: 'Prescription · Ibuprofen',
    });
    expect(
      (await lina.req('POST', `/v1/messages/${message.id}/kit`, { to: 'ready' })).statusCode,
    ).toBe(403);
    const collected = await lina.req('POST', `/v1/messages/${message.id}/kit`, { to: 'collected' });
    expect(collected.statusCode).toBe(200);

    const moved = await told(apps.pharmacy.id, 'kit.moved');
    expect(moved).toEqual([
      expect.objectContaining({
        conversationId: convo,
        message: expect.objectContaining({ id: message.id, seq: Number(message.seq) }),
        kit: { key: 'prescription', name: 'Prescription', custom: true },
        from: 'preparing',
        to: 'ready',
        state: 'ready',
        fields: { medicine: 'Ibuprofen' },
        by: 'person',
        customer: expect.objectContaining({ id: lina.user.id, under18: false }),
      }),
      expect.objectContaining({ from: 'ready', to: 'collected', by: 'customer' }),
    ]);
    // The organization's other apps hear nothing of another's cards.
    expect(await told(apps.second.id)).toEqual([]);
  });

  it('are moved and changed by their app, and by no other', async () => {
    const { message } = await send(apps.pharmacy.token, convo, card({ medicine: 'Insulin' }));
    const before = (await told(apps.pharmacy.id)).length;
    const other = await as(apps.second.token, 'POST', `/v1/messages/${message.id}/kit`, {
      to: 'ready',
    });
    expect(other.statusCode).toBe(403);
    expect(other.json().error.message).toBe('An app moves only its own cards.');

    const changed = await as(apps.pharmacy.token, 'PATCH', `/v1/messages/${message.id}/kit`, {
      fields: { notes: 'Keep it cold', readyBy: { at: '2026-10-03T09:00:00Z', hasTime: true } },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().message.payload.fields).toEqual({
      medicine: 'Insulin',
      notes: 'Keep it cold',
      readyBy: { at: '2026-10-03T09:00:00.000Z', hasTime: true },
    });
    const renamed = await as(apps.pharmacy.token, 'PATCH', `/v1/messages/${message.id}/kit`, {
      fields: { medicine: 'Insulin glargine', notes: null },
    });
    expect(renamed.json().message.payload).toMatchObject({
      title: 'Insulin glargine',
      fields: { medicine: 'Insulin glargine', readyBy: expect.any(Object) },
    });
    expect(renamed.json().message.payload.fields.notes).toBeUndefined();
    expect(
      (
        await as(apps.pharmacy.token, 'PATCH', `/v1/messages/${message.id}/kit`, {
          fields: { medicine: null },
        })
      ).json().error.message,
    ).toBe('Medicine is needed.');
    expect(
      (await as(apps.second.token, 'PATCH', `/v1/messages/${message.id}/kit`, { fields: {} }))
        .statusCode,
    ).toBe(403);
    expect(
      (await omar.req('PATCH', `/v1/messages/${message.id}/kit`, { fields: { notes: 'x' } }))
        .statusCode,
    ).toBe(403);

    // Its own move, as the organization: what it changed stays, and it isn't told of it.
    const ready = await as(apps.pharmacy.token, 'POST', `/v1/messages/${message.id}/kit`, {
      to: 'ready',
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().message.payload).toMatchObject({
      state: 'ready',
      fields: { medicine: 'Insulin glargine' },
    });
    expect(await told(apps.pharmacy.id)).toHaveLength(before);
    // The customer's move is the customer's.
    const notMine = await as(apps.pharmacy.token, 'POST', `/v1/messages/${message.id}/kit`, {
      to: 'collected',
    });
    expect(notMine.statusCode).toBe(403);
  });

  it('let an app move Caime’s own cards its bot sent, never those someone else did', async () => {
    const order = await send(apps.pharmacy.token, convo, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'order_status', fields: { reference: '4821' } },
    });
    expect(order.res.statusCode, order.res.body).toBe(201);
    const confirmed = await as(
      apps.pharmacy.token,
      'POST',
      `/v1/messages/${order.message.id}/kit`,
      {
        to: 'confirmed',
      },
    );
    expect(confirmed.statusCode).toBe(200);
    await lina.post(`/v1/messages/${order.message.id}/kit`, { to: 'shipped' });
    expect((await told(apps.pharmacy.id, 'kit.moved')).at(-1)).toMatchObject({
      kit: { key: 'order_status', name: 'Order', custom: false },
      from: 'confirmed',
      to: 'shipped',
      by: 'customer',
    });
    const omars = await omar.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'order_status', fields: { reference: '4822' } },
    });
    const refused = await as(apps.pharmacy.token, 'POST', `/v1/messages/${omars.message.id}/kit`, {
      to: 'confirmed',
    });
    expect(refused.statusCode).toBe(403);
  });

  it('are sent by the team from what its apps have made, and the app hears', async () => {
    const offered = await omar.get(`/v1/conversations/${convo}/kits`);
    expect(offered.kits).toEqual([
      {
        app: { id: apps.pharmacy.id, name: 'Nile Pharmacy' },
        key: 'prescription',
        name: 'Prescription',
        description: 'A prescription, and when it’s ready',
        icon: 'clipboard-list',
        fields: PRESCRIPTION.fields.map((f) => expect.objectContaining({ key: f.key })),
      },
    ]);
    // Never to the customer, nor outside a conversation with the organization.
    expect((await lina.get(`/v1/conversations/${convo}/kits`)).kits).toEqual([]);
    expect((await omar.get(`/v1/conversations/${direct}/kits`)).kits).toEqual([]);
    expect(
      (await as(apps.pharmacy.token, 'GET', `/v1/conversations/${convo}/kits`)).statusCode,
    ).toBe(403);

    const sent = await omar.req(
      'POST',
      `/v1/conversations/${convo}/messages`,
      card({ medicine: 'Paracetamol' }, { app: apps.pharmacy.id }),
    );
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json().message.payload).toMatchObject({
      app: { id: apps.pharmacy.id },
      title: 'Paracetamol',
      state: 'preparing',
    });
    expect((await told(apps.pharmacy.id, 'kit.posted')).at(-1)).toMatchObject({
      message: expect.objectContaining({ id: sent.json().message.id }),
      kit: { key: 'prescription', custom: true },
      state: 'preparing',
      fields: { medicine: 'Paracetamol' },
      by: 'person',
    });
    expect(await told(apps.second.id)).toEqual([]);
    // An app hears only what it asked to.
    await noor.patch(`/v1/orgs/${orgId}/apps/${apps.pharmacy.id}`, { events: ['kit.moved'] });
    const posted = (await told(apps.pharmacy.id, 'kit.posted')).length;
    await omar.post(
      `/v1/conversations/${convo}/messages`,
      card({ medicine: 'Aspirin' }, { app: apps.pharmacy.id }),
    );
    expect(await told(apps.pharmacy.id, 'kit.posted')).toHaveLength(posted);
    await noor.patch(`/v1/orgs/${orgId}/apps/${apps.pharmacy.id}`, {
      events: ['kit.posted', 'kit.moved'],
    });
  });

  it('about money never reach anyone under 18 (R29)', async () => {
    const deposit = await as(apps.pharmacy.token, 'PUT', '/v1/kits/deposit', {
      name: 'Deposit',
      fields: [
        { key: 'title', label: 'For', type: 'text', required: true },
        { key: 'amount', label: 'Amount', type: 'amount', required: true },
      ],
      states: [
        { id: 'asked', label: 'Asked' },
        { id: 'paid', label: 'Paid', tone: 'positive' },
      ],
      moves: [{ from: 'asked', to: 'paid', label: 'Paid', who: 'organization' }],
    });
    expect(deposit.json().kit.adultsOnly).toBe(true);
    const keys = async (id: string) =>
      (await omar.get(`/v1/conversations/${id}/kits`)).kits.map((k: { key: string }) => k.key);
    expect(await keys(convo)).toEqual(['prescription', 'deposit']);
    expect(await keys(ramiConvo)).toEqual(['prescription']);
    const refused = await send(apps.pharmacy.token, ramiConvo, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'custom',
        key: 'deposit',
        fields: { title: 'Books', amount: { value: 20, currency: 'EGP' } },
      },
    });
    expect(refused.res.statusCode).toBe(403);
    expect(refused.res.json().error.message).toBe(
      'Deposit cards aren’t available in this conversation.',
    );
    // What the app hears of a young customer says so.
    const { message } = await send(apps.pharmacy.token, ramiConvo, card({ medicine: 'Inhaler' }));
    await omar.post(`/v1/messages/${message.id}/kit`, { to: 'ready' });
    expect((await told(apps.pharmacy.id, 'kit.moved')).at(-1)).toMatchObject({
      customer: { id: rami.user.id, under18: true },
    });
  });

  it('two changes at once both hold, and none reaches a card taken back', async () => {
    const { message } = await send(apps.pharmacy.token, convo, card({ medicine: 'Salbutamol' }));
    const patch = (fields: Record<string, unknown>) =>
      as(apps.pharmacy.token, 'PATCH', `/v1/messages/${message.id}/kit`, { fields });
    const [a, b] = await Promise.all([
      patch({ notes: 'Two puffs' }),
      patch({ readyBy: { at: '2026-10-04T09:00:00Z', hasTime: true } }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const row = await t.ctx.db
      .selectFrom('messages')
      .select('payload')
      .where('id', '=', message.id)
      .executeTakeFirstOrThrow();
    expect((row.payload as { fields: Record<string, unknown> }).fields).toMatchObject({
      medicine: 'Salbutamol',
      notes: 'Two puffs',
      readyBy: { hasTime: true },
    });
    await t.ctx.db
      .updateTable('messages')
      .set({ deleted_at: t.ctx.now(), payload: '{}' })
      .where('id', '=', message.id)
      .execute();
    expect((await patch({ notes: 'Back?' })).statusCode).toBe(400);
    // Two moves from where it stood, at once: one moves it, the other hears someone did.
    const other = await send(apps.pharmacy.token, convo, card({ medicine: 'Zinc' }));
    const moves = await Promise.all(
      [omar, omar].map((c) =>
        c.req('POST', `/v1/messages/${other.message.id}/kit`, { to: 'ready' }),
      ),
    );
    expect(moves.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('keep the last 50 moves, and tell the other side of each under the card’s one tag', async () => {
    expect(
      (
        await as(apps.pharmacy.token, 'PUT', '/v1/kits/toggle', {
          name: 'Toggle',
          fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
          states: [
            { id: 'off', label: 'Off' },
            { id: 'on', label: 'On' },
          ],
          moves: [
            { from: 'off', to: 'on', label: 'Turn on', who: 'anyone' },
            { from: 'on', to: 'off', label: 'Turn off', who: 'anyone' },
          ],
        })
      ).statusCode,
    ).toBe(201);
    const { message } = await send(apps.pharmacy.token, convo, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'custom', key: 'toggle', fields: { title: 'Porch light' } },
    });
    for (let i = 0; i < 52; i++)
      expect(
        (
          await omar.req('POST', `/v1/messages/${message.id}/kit`, {
            to: i % 2 === 0 ? 'on' : 'off',
          })
        ).statusCode,
      ).toBe(200);
    const row = await t.ctx.db
      .selectFrom('messages')
      .select('payload')
      .where('id', '=', message.id)
      .executeTakeFirstOrThrow();
    const history = (row.payload as { history: Array<{ state: string }> }).history;
    expect(history).toHaveLength(50);
    expect(history.at(-1)?.state).toBe('off');
    // Each move told under the card's one tag, so the latest takes the last one's place.
    const heard = await t.ctx.db
      .selectFrom('notifications')
      .select('group_key')
      .where('user_id', '=', lina.user.id)
      .where('kind', '=', 'kit')
      .where(sql<string>`data->>'messageId'`, '=', message.id)
      .execute();
    expect(heard.length).toBeGreaterThan(0);
    expect(new Set(heard.map((n) => n.group_key))).toEqual(new Set([`kit:${message.id}`]));
  });

  it('are named by an app’s id, and anything else finds none', async () => {
    const res = await omar.req(
      'POST',
      `/v1/conversations/${convo}/messages`,
      card({ medicine: 'A' }, { app: 'not-an-id' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('That card isn’t available here.');
  });

  it('keep what they were sent with when their kit changes or goes, or their app does', async () => {
    const { message } = await send(apps.pharmacy.token, convo, card({ medicine: 'Vitamin D' }));
    // The kit changes: the card already sent doesn't.
    await as(apps.pharmacy.token, 'PUT', '/v1/kits/prescription', {
      ...PRESCRIPTION,
      states: [
        { id: 'preparing', label: 'In the works' },
        { id: 'done', label: 'Done' },
      ],
      moves: [{ from: 'preparing', to: 'done', label: 'Done', who: 'anyone' }],
    });
    const ready = await omar.req('POST', `/v1/messages/${message.id}/kit`, { to: 'ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().message.payload.def.states.map((s: { id: string }) => s.id)).toEqual([
      'preparing',
      'ready',
      'collected',
    ]);
    // The kit goes: its cards stay, and no more are sent.
    expect((await as(apps.pharmacy.token, 'DELETE', '/v1/kits/prescription')).statusCode).toBe(200);
    const gone = await send(apps.pharmacy.token, convo, card({ medicine: 'A' }));
    expect(gone.res.statusCode).toBe(400);
    // The app goes: its cards stay and still move, its kits aren't offered, and it hears nothing.
    const heardBefore = (await told(apps.pharmacy.id)).length;
    expect(
      (await noor.req('DELETE', `/v1/orgs/${orgId}/apps/${apps.pharmacy.id}`)).statusCode,
    ).toBe(200);
    expect((await omar.get(`/v1/conversations/${convo}/kits`)).kits).toEqual([]);
    // Nor sent by hand, though its kind of card was still there.
    const byHand = await omar.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'custom',
        app: apps.pharmacy.id,
        key: 'deposit',
        fields: { title: 'Books', amount: { value: 20, currency: 'EGP' } },
      },
    });
    expect(byHand.statusCode).toBe(400);
    expect(byHand.json().error.message).toBe('That card isn’t available here.');
    const collected = await lina.req('POST', `/v1/messages/${message.id}/kit`, { to: 'collected' });
    expect(collected.statusCode).toBe(200);
    expect(await told(apps.pharmacy.id)).toHaveLength(heardBefore);
  });
});
