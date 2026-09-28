import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { uuidv4 } from '@caishy/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;
let photo: Buffer;

async function upload(c: Client, name: string) {
  const boundary = `----caishy${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    photo,
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
  return res.json().file as { id: string; url: string };
}

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Ahmed' });
  photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7c5cff' } })
    .jpeg()
    .toBuffer();
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'manager', orgName: 'DATA C' },
  });
  convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  await hassan.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    body: 'From Hassan',
  });
  await sarah.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    body: 'From Sarah',
  });
  await t.ctx.flush();
});
afterAll(async () => {
  await t.close();
});

describe('your data', () => {
  it('exports what is yours as a download, and nothing that is someone else’s', async () => {
    // What can act for him and what he made for others: named in it, never their secrets.
    const token = await hassan.post('/v1/me/tokens', {
      name: 'Backup script',
      scopes: ['messages:read'],
      days: 30,
    });
    const made = await hassan.post('/v1/me/oauth-apps', {
      name: 'Hassan’s digest',
      redirectUris: ['https://digest.example/cb'],
      confidential: true,
    });
    const planner = (
      await sarah.post('/v1/me/oauth-apps', {
        name: 'Sarah’s planner',
        redirectUris: ['https://planner.example/cb'],
      })
    ).app;
    await hassan.post('/v1/oauth/authorize', {
      response_type: 'code',
      client_id: planner.clientId,
      redirect_uri: 'https://planner.example/cb',
      scope: 'actions:read',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      decision: 'allow',
    });
    const calendar = await hassan.post('/v1/calendar/feed');
    // What he set Caishy to keep, and what he saved: where it is, never someone else's words.
    await hassan.post('/v1/automations', {
      when: { sphere: 'work', kinds: ['link'] },
      collection: 'Work links',
    });
    const brief = await sarah.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'The brief is at https://brief.example/q3',
    });
    await t.ctx.flush();
    const fromSarah = await t.ctx.db
      .selectFrom('messages')
      .select('id')
      .where('body', '=', 'From Sarah')
      .executeTakeFirstOrThrow();
    await hassan.post(`/v1/messages/${fromSarah.id}/save`, { collection: 'Keep' });
    // A link he saved from a group he's left isn't his to see any more, nor in his export.
    const club = (
      await sarah.post('/v1/conversations', {
        kind: 'group',
        title: 'Reading',
        memberIds: [hassan.user.id],
      })
    ).conversation.id;
    const gone = await sarah.post(`/v1/conversations/${club}/messages`, {
      clientId: uuidv4(),
      body: 'Notes at https://notes.example/secret',
    });
    await hassan.post(`/v1/messages/${gone.message.id}/save`, { collection: 'Keep' });
    await hassan.del(`/v1/conversations/${club}/members/${hassan.user.id}`);
    const res = await hassan.req('GET', '/v1/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="caishy-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const archive = res.json();
    expect(archive.format).toBe('caishy-export/2');
    expect(archive.account.id).toBe(hassan.user.id);
    expect(archive.relationships[0]).toMatchObject({
      label: 'Manager · DATA C',
      person: { displayName: 'Sarah Ahmed' },
    });
    // (Leaving the group wrote a line about it, his too.)
    expect(
      archive.messages.filter((m: any) => m.kind !== 'system').map((m: any) => m.body),
    ).toEqual(['From Hassan']);
    expect(JSON.stringify(archive)).not.toContain('From Sarah');
    expect(JSON.stringify(archive)).not.toContain('password');
    expect(archive.accessTokens).toEqual([
      expect.objectContaining({ name: 'Backup script', scopes: ['messages:read'] }),
    ]);
    expect(archive.appsYouMade).toEqual([
      expect.objectContaining({
        name: 'Hassan’s digest',
        clientId: made.app.clientId,
        confidential: true,
      }),
    ]);
    expect(archive.connectedApps).toEqual([
      expect.objectContaining({ name: 'Sarah’s planner', scopes: ['actions:read'] }),
    ]);
    expect(JSON.stringify(archive)).not.toContain(token.token);
    expect(JSON.stringify(archive)).not.toContain(made.clientSecret);
    // That a calendar reads his actions, never the address it reads them from.
    expect(archive.calendarFeed).toEqual({
      createdAt: t.clock.now.toISOString(),
      lastReadAt: null,
    });
    expect(JSON.stringify(archive)).not.toContain(/cal_[\w-]{43}/.exec(calendar.url)![0]);
    expect(archive.automations).toEqual([
      expect.objectContaining({
        description: 'When someone from work sends a link, save it to Work links',
        when: expect.objectContaining({ sphere: 'work', kinds: ['link'] }),
        collection: 'Work links',
        enabled: true,
        // Sarah's link here and the one in the group (what it kept there is gone with him).
        runs: 2,
      }),
    ]);
    expect(archive.saved).toEqual([
      expect.objectContaining({
        collection: 'Work links',
        conversationId: convo,
        messageId: brief.message.id,
        stillVisible: true,
        kept: { kind: 'link', file: null, link: 'https://brief.example/q3' },
      }),
      expect.objectContaining({
        collection: 'Keep',
        messageId: fromSarah.id,
        stillVisible: true,
        kept: null,
      }),
      // Saved in the group he's left: that he saved it, and where, never what.
      expect.objectContaining({
        collection: 'Keep',
        conversationId: club,
        messageId: gone.message.id,
        stillVisible: false,
        kept: null,
      }),
      expect.objectContaining({
        collection: 'Work links',
        conversationId: club,
        messageId: gone.message.id,
        stillVisible: false,
        kept: null,
      }),
    ]);
    expect(JSON.stringify(archive)).not.toContain('The brief is at');
    expect(JSON.stringify(archive)).not.toContain('notes.example');
  });

  it('has the rest of what Caishy keeps about you, and still none of anyone else’s words', async () => {
    const noor = await signup(t, { displayName: 'Noor Hadi' });
    const omar = await signup(t, { displayName: 'Omar Said' });
    const lina = await signup(t, { displayName: 'Lina Aziz' });
    const sami = await signup(t, { displayName: 'Sami Nasser' });
    const db = t.ctx.db;
    // Omar asks Noor, with a note of his; she accepts. She asks Lina, describing her.
    const asked = await omar.post('/v1/connections/requests', {
      toUserId: noor.user.id,
      note: 'Omar’s note to Noor',
    });
    const dm = (await noor.post(`/v1/connections/requests/${asked.requestId}/accept`, {}))
      .conversationId;
    await noor.post('/v1/connections/requests', {
      toUserId: lina.user.id,
      note: 'Noor’s note to Lina',
      relationship: { sphere: 'family', role: 'cousin' },
    });
    const his = await omar.post(`/v1/conversations/${dm}/messages`, {
      clientId: uuidv4(),
      body: 'Omar’s words',
    });
    const mine = await noor.post(`/v1/conversations/${dm}/messages`, {
      clientId: uuidv4(),
      body: 'Noor’s words',
    });
    await noor.post(`/v1/messages/${his.message.id}/reactions`, { emoji: '👍' });
    await noor.post('/v1/blocks', { userId: sami.user.id });
    const made = await noor.post('/v1/reports', {
      messageId: his.message.id,
      reason: 'spam',
      details: 'Noor’s report',
    });
    expect(made).toBeDefined();
    // One about her stays with the people who run Caishy: it would say who made it.
    await omar.post('/v1/reports', {
      userId: noor.user.id,
      reason: 'harassment',
      details: 'Omar’s report about Noor',
    });
    // A second device, signed out since, and notifications on the first.
    const second = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        identifier: noor.user.handle,
        password: 'correct horse battery',
        client: 'native',
        deviceName: 'Old phone',
      },
    });
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${second.json().token}` },
    });
    const first = await db
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', noor.user.id)
      .where('revoked_at', 'is', null)
      .executeTakeFirstOrThrow();
    await db
      .insertInto('push_subscriptions')
      .values({
        id: uuidv4(),
        user_id: noor.user.id,
        session_id: first.id,
        kind: 'webpush',
        endpoint: 'https://push.example/noors-secret-endpoint',
        keys: JSON.stringify({ p256dh: 'p256dh-key', auth: 'auth-key' }),
      })
      .execute();
    await db
      .insertInto('e2ee_devices')
      .values({
        id: uuidv4(),
        user_id: noor.user.id,
        name: 'Noor’s laptop',
        encryption_key: JSON.stringify({ kty: 'EC', x: 'enc' }),
        signing_key: JSON.stringify({ kty: 'EC', x: 'sig' }),
        introduction: '',
      })
      .execute();
    await db
      .insertInto('hidden_messages')
      .values({ message_id: his.message.id, user_id: noor.user.id })
      .execute();
    await db
      .insertInto('custom_roles')
      .values({ id: uuidv4(), user_id: noor.user.id, sphere: 'friend', label: 'Climbing partner' })
      .execute();
    // What Caishy suggested: why, only when it wasn't a message (a reason built from one quotes
    // it, and can come to quote a reply to it: "I'll send it Thursday", actions.test.ts).
    await db
      .insertInto('suggestions')
      .values([
        {
          id: uuidv4(),
          user_id: noor.user.id,
          kind: 'task',
          title: 'Answer Omar',
          rationale: 'Omar wrote “Omar’s words”',
          confidence: 0.8,
          conversation_id: dm,
          message_id: his.message.id,
          fingerprint: uuidv4(),
        },
        {
          id: uuidv4(),
          user_id: noor.user.id,
          kind: 'waiting',
          title: 'Do what she said',
          rationale: 'Omar wrote “Omar’s reply to her”',
          confidence: 0.7,
          conversation_id: dm,
          message_id: mine.message.id,
          subject_user_id: omar.user.id,
          fingerprint: uuidv4(),
        },
        {
          id: uuidv4(),
          user_id: noor.user.id,
          kind: 'reconnect',
          title: 'Catch up with Omar',
          rationale: 'You haven’t talked since June',
          confidence: 0.6,
          subject_user_id: omar.user.id,
          fingerprint: uuidv4(),
        },
      ])
      .execute();
    // Omar's action, waiting on her, and one he keeps to himself about her; hers, waiting on
    // him. A decision he recorded as hers.
    await db
      .insertInto('tasks')
      .values([
        {
          id: uuidv4(),
          owner_id: omar.user.id,
          assignee_id: noor.user.id,
          shared: true,
          title: 'Bring the ropes',
          notes: 'Omar’s notes on it',
        },
        {
          id: uuidv4(),
          owner_id: omar.user.id,
          assignee_id: noor.user.id,
          shared: false,
          title: 'Omar’s own reminder about Noor',
        },
        {
          id: uuidv4(),
          owner_id: noor.user.id,
          assignee_id: omar.user.id,
          shared: false,
          title: 'Get the harness back',
          notes: 'Noor’s notes',
          relationship_snapshot: JSON.stringify({ sphere: 'friend', role: 'climbing partner' }),
        },
      ])
      .execute();
    await db
      .insertInto('decisions')
      .values({
        id: uuidv4(),
        conversation_id: dm,
        title: 'Climb on Saturday',
        notes: 'Omar’s notes on the decision',
        decided_by: noor.user.id,
        recorded_by: omar.user.id,
      })
      .execute();
    await db
      .insertInto('calls')
      .values({
        id: uuidv4(),
        conversation_id: dm,
        caller_id: omar.user.id,
        callee_id: noor.user.id,
        kind: 'video',
        state: 'ended',
        outcome: 'missed',
        caller_device: 'omar-phone',
        created_at: t.clock.now,
        seen_at: t.clock.now,
        ended_at: t.clock.now,
      })
      .execute();
    await db
      .insertInto('billing_customers')
      .values({ id: 'cus_noor', livemode: false, user_id: noor.user.id })
      .execute();
    await db
      .insertInto('billing_subscriptions')
      .values({
        id: 'sub_noor',
        customer_id: 'cus_noor',
        plan: 'pro',
        interval: 'month',
        status: 'active',
        amount: 500,
        currency: 'eur',
      })
      .execute();
    await t.ctx.flush();

    const archive = (await noor.req('GET', '/v1/me/export')).json();
    const text = JSON.stringify(archive);
    expect(archive.account).toMatchObject({ id: noor.user.id, joinedThrough: null });
    expect(archive.account).toHaveProperty('lastActiveAt');
    expect(archive.recoveryCodes).toEqual({ left: 10, madeAt: expect.any(String) });
    for (const code of noor.recoveryCodes) expect(text).not.toContain(code);
    expect(archive.connectionRequests).toEqual([
      expect.objectContaining({
        direction: 'received',
        person: { displayName: 'Omar Said', handle: omar.user.handle },
        note: null,
        yourDescription: null,
        status: 'accepted',
      }),
      expect.objectContaining({
        direction: 'sent',
        person: { displayName: 'Lina Aziz', handle: lina.user.handle },
        note: 'Noor’s note to Lina',
        yourDescription: expect.objectContaining({ sphere: 'family', role: 'cousin' }),
      }),
    ]);
    expect(archive.connections).toEqual([
      expect.objectContaining({ displayName: 'Omar Said', status: 'active' }),
    ]);
    expect(archive.yourRoles).toEqual([expect.objectContaining({ label: 'Climbing partner' })]);
    expect(archive.blocked.people).toEqual([
      expect.objectContaining({ displayName: 'Sami Nasser', handle: sami.user.handle }),
    ]);
    expect(archive.messages.map((m: any) => m.body)).toContain('Noor’s words');
    expect(archive.reactions).toEqual([
      expect.objectContaining({ messageId: his.message.id, emoji: '👍' }),
    ]);
    expect(archive.hiddenMessages).toEqual([
      expect.objectContaining({ messageId: his.message.id }),
    ]);
    const omarAs = { displayName: 'Omar Said', handle: omar.user.handle };
    expect(archive.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Answer Omar', reason: null, about: null }),
        expect.objectContaining({ title: 'Do what she said', reason: null, about: omarAs }),
        expect.objectContaining({
          title: 'Catch up with Omar',
          reason: 'You haven’t talked since June',
          about: omarAs,
        }),
      ]),
    );
    // What someone keeps to themselves about her is theirs, like their own notes.
    expect(archive.actions).toEqual([
      expect.objectContaining({
        title: 'Bring the ropes',
        yours: false,
        from: omarAs,
        waitingOn: null,
        assignedToYou: true,
        notes: null,
      }),
      expect.objectContaining({
        title: 'Get the harness back',
        yours: true,
        from: null,
        waitingOn: {
          person: omarAs,
          asYouKnewThem: { sphere: 'friend', role: 'climbing partner' },
        },
        assignedToYou: false,
        notes: 'Noor’s notes',
      }),
    ]);
    expect(archive.decisions).toEqual([
      expect.objectContaining({
        title: 'Climb on Saturday',
        decidedByYou: true,
        recordedByYou: false,
      }),
    ]);
    expect(archive.decisions[0]).not.toHaveProperty('notes');
    expect(archive.calls).toEqual([
      expect.objectContaining({
        kind: 'video',
        direction: 'incoming',
        with: { displayName: 'Omar Said', handle: omar.user.handle },
        outcome: 'missed',
      }),
    ]);
    expect(archive.reports).toEqual([
      expect.objectContaining({
        messageId: his.message.id,
        reason: 'spam',
        details: 'Noor’s report',
      }),
    ]);
    // Her devices: the one signed out since too, with where each signed in from.
    expect(archive.devices).toHaveLength(2);
    const [now, old] = [
      archive.devices.find((d: any) => d.signedOutAt === null),
      archive.devices.find((d: any) => d.deviceName === 'Old phone'),
    ];
    expect(old).toMatchObject({ signedOutAt: expect.any(String), notifications: [] });
    // Which service holds its address for notifications; never the address, nor its keys.
    expect(now).toMatchObject({
      networkAddress: expect.any(String),
      notifications: [
        { kind: 'webpush', service: 'push.example', since: expect.any(String), failures: 0 },
      ],
    });
    expect(archive.privateConversationDevices).toEqual([
      expect.objectContaining({
        name: 'Noor’s laptop',
        publicKeys: { encryption: { kty: 'EC', x: 'enc' }, signing: { kty: 'EC', x: 'sig' } },
      }),
    ]);
    expect(archive.securityRecords.map((r: any) => r.action)).toEqual(
      expect.arrayContaining(['auth.signup', 'auth.login', 'auth.logout']),
    );
    expect(archive.activityLog.map((e: any) => e.type)).toContain('message.sent');
    expect(archive.notifications.length).toBeGreaterThan(0);
    expect(archive.billing).toEqual([
      expect.objectContaining({
        stripeCustomer: 'cus_noor',
        test: true,
        subscriptions: [expect.objectContaining({ plan: 'pro', amount: 500, currency: 'eur' })],
      }),
    ]);
    // Nobody else's words, and no secret.
    for (const theirs of [
      'Omar’s words',
      'Omar’s note to Noor',
      'Omar’s notes on it',
      'Omar’s notes on the decision',
      'Omar’s report about Noor',
      'Omar’s reply to her',
      'Omar’s own reminder about Noor',
      'noors-secret-endpoint',
      'p256dh-key',
      'auth-key',
      noor.token,
      second.json().token,
    ])
      expect(text).not.toContain(theirs);
  });

  it('says only what the app shows: not what others did in their name, nor what changed after', async () => {
    const db = t.ctx.db;
    const karim = await signup(t, { displayName: 'Karim Adel' });
    const yara = await signup(t, { displayName: 'Yara Young', birthYear: 2011 });
    // Rana came through Yara's link: that a person's link brought her is counted, never whose.
    const joined = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: `rana${uuidv4().slice(0, 8)}@example.com`,
        password: 'correct horse battery',
        displayName: 'Rana Aziz',
        handle: `rana${uuidv4().slice(0, 8)}`,
        birthYear: 1990,
        client: 'native',
        invite: `@${yara.user.handle}`,
      },
    });
    expect(joined.statusCode).toBe(201);
    const rana = clientFor(t, joined.json().token, joined.json().user);
    const asked = await rana.post('/v1/connections/requests', { toUserId: karim.user.id });
    const dm = (await karim.post(`/v1/connections/requests/${asked.requestId}/accept`, {}))
      .conversationId;
    const karimAs = { displayName: 'Karim Adel', handle: karim.user.handle };
    const omid = await signup(t, { displayName: 'Omid Nasr' });
    const connect = async (a: Client, b: Client) => {
      const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
      await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    };
    await connect(karim, omid);
    // One she sent that Dana turned down: a sender only ever learns it didn't go ahead.
    const dana = await signup(t, { displayName: 'Dana Lee' });
    const unanswered = await rana.post('/v1/connections/requests', {
      toUserId: dana.user.id,
      note: 'Rana’s note to Dana',
    });
    await dana.post(`/v1/connections/requests/${unanswered.requestId}/decline`, {});

    // A rule of hers for Karim names him.
    const connection = (await rana.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === karim.user.id,
    );
    await rana.post('/v1/policies', {
      scope: { connectionId: connection.connectionId },
      settings: { notify: 'always' },
    });

    // She calls; he turns it down. She's told what the app tells a caller: no answer.
    const rung = (
      await rana.post(`/v1/conversations/${dm}/calls`, { kind: 'voice', deviceId: 'rana-tab' })
    ).call.id;
    await karim.post(`/v1/calls/${rung}/decline`, {});

    // Checklists: what she added to his, and on hers only what she put there.
    const list = (kit: string, fields: unknown) => ({
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit, fields },
    });
    const his = (
      await karim.post(
        `/v1/conversations/${dm}/messages`,
        list('checklist', { title: 'Karim’s list', items: ['Karim’s first item'] }),
      )
    ).message;
    await rana.post(`/v1/messages/${his.id}/checklist`, { op: 'add', text: 'Rana’s item' });
    await rana.post(`/v1/messages/${his.id}/checklist`, {
      op: 'toggle',
      itemId: 'i1',
      done: true,
    });
    const hers = (
      await rana.post(
        `/v1/conversations/${dm}/messages`,
        list('checklist', { title: 'Trip', items: ['Tickets'] }),
      )
    ).message;
    await karim.post(`/v1/messages/${hers.id}/checklist`, { op: 'add', text: 'Karim’s addition' });
    await rana.post(`/v1/messages/${hers.id}/checklist`, { op: 'add', text: 'Passport' });
    await karim.post(`/v1/messages/${hers.id}/checklist`, {
      op: 'toggle',
      itemId: 'i1',
      done: true,
    });

    // A group she made and left: what it's called since, and her context in it edited since,
    // are for the people still in it. One of hers alone stays hers.
    const group = (
      await rana.post('/v1/conversations', {
        kind: 'group',
        title: 'Climbing club',
        memberIds: [karim.user.id],
      })
    ).conversation.id;
    const inGroup = (
      await rana.post('/v1/contexts', {
        kind: 'project',
        title: 'Rana’s trip',
        conversationId: group,
      })
    ).id as string;
    await rana.post('/v1/contexts', { kind: 'project', title: 'Rana’s own plan' });
    await rana.del(`/v1/conversations/${group}/members/${rana.user.id}`);
    await karim.patch(`/v1/conversations/${group}`, { title: 'Karim’s new name' });
    await karim.patch(`/v1/contexts/${inGroup}`, { title: 'Karim’s edit' });
    const space = (
      await rana.post('/v1/spaces', {
        name: 'Rana’s space',
        kind: 'community',
        memberIds: [karim.user.id],
      })
    ).space.id;
    await rana.del(`/v1/spaces/${space}/members/${rana.user.id}`);
    await karim.patch(`/v1/spaces/${space}`, { name: 'Karim’s space name' });

    // An app she made for her studio, changed by Karim after she left it.
    const studio = (
      await rana.post('/v1/orgs', {
        name: 'Rana Studio',
        handle: `studio.${uuidv4().slice(0, 6)}`,
        kind: 'shop',
      })
    ).org.id;
    await rana.post(`/v1/orgs/${studio}/members`, { userIds: [karim.user.id] });
    await rana.patch(`/v1/orgs/${studio}/members/${karim.user.id}`, { role: 'admin' });
    const made = (
      await rana.post(`/v1/orgs/${studio}/apps`, {
        name: 'Studio sync',
        scopes: ['messages:read'],
        webhookUrl: 'https://hooks.example/rana',
        events: ['business.message'],
      })
    ).app.id;
    const rewritten = (await rana.post(`/v1/orgs/${studio}/updates`, { body: 'Rana’s update' }))
      .update.id;
    await rana.post(`/v1/orgs/${studio}/updates`, { body: 'Rana’s other update' });
    // She leaves it to Karim, who runs it now.
    await rana.del(`/v1/orgs/${studio}/members/${rana.user.id}`);
    await karim.patch(`/v1/orgs/${studio}/apps/${made}`, {
      webhookUrl: 'https://hooks.example/karims-secret-path',
    });
    await karim.patch(`/v1/orgs/${studio}/updates/${rewritten}`, { body: 'Karim’s rewrite' });
    // And one she made while she ran Karim's lab with him, changed after he made her an agent.
    const lab = (
      await karim.post('/v1/orgs', {
        name: 'Karim’s Lab',
        handle: `lab.${uuidv4().slice(0, 6)}`,
        kind: 'shop',
      })
    ).org.id;
    await karim.post(`/v1/orgs/${lab}/members`, { userIds: [rana.user.id] });
    await karim.patch(`/v1/orgs/${lab}/members/${rana.user.id}`, { role: 'admin' });
    const labApp = (
      await rana.post(`/v1/orgs/${lab}/apps`, {
        name: 'Lab hook',
        scopes: ['messages:read'],
        webhookUrl: 'https://hooks.example/lab',
        events: ['business.message'],
      })
    ).app.id;
    await karim.patch(`/v1/orgs/${lab}/members/${rana.user.id}`, { role: 'agent' });
    await karim.patch(`/v1/orgs/${lab}/apps/${labApp}`, {
      webhookUrl: 'https://hooks.example/lab-since',
    });

    // As a customer of Karim's shop: its app is sent her messages, and hears what's done with its
    // card (not what it did itself).
    const shop = (
      await karim.post('/v1/orgs', {
        name: 'Karim’s Shop',
        handle: `shop.${uuidv4().slice(0, 6)}`,
        kind: 'shop',
      })
    ).org.id;
    await db
      .updateTable('organizations')
      .set({ plan: 'business' })
      .where('id', '=', shop)
      .execute();
    const app = (
      await karim.req('POST', `/v1/orgs/${shop}/apps`, {
        name: 'Shop sync',
        scopes: ['messages:write', 'kits'],
        webhookUrl: 'https://hooks.example/shop',
        events: ['business.message', 'kit.posted', 'kit.moved'],
      })
    ).json();
    const asApp = (method: 'POST' | 'PUT', url: string, body: unknown) =>
      t.app.inject({
        method,
        url,
        payload: body as object,
        headers: { authorization: `Bearer ${app.token}` },
      });
    expect(
      (
        await asApp('PUT', '/v1/kits/order', {
          name: 'Order',
          fields: [{ key: 'item', label: 'Item', type: 'text', required: true }],
          states: [
            { id: 'placed', label: 'Placed' },
            { id: 'ready', label: 'Ready', tone: 'positive' },
            { id: 'collected', label: 'Collected', tone: 'positive' },
          ],
          moves: [
            { from: 'placed', to: 'ready', label: 'Mark ready', who: 'organization' },
            { from: 'ready', to: 'collected', label: 'I collected it', who: 'customer' },
          ],
        })
      ).statusCode,
    ).toBe(201);
    const customer = (await rana.post(`/v1/orgs/${shop}/conversations`)).conversationId;
    await rana.post(`/v1/conversations/${customer}/messages`, {
      clientId: uuidv4(),
      body: 'Rana asks the shop',
    });
    const order = (
      await asApp('POST', `/v1/conversations/${customer}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: { kit: 'custom', key: 'order', fields: { item: 'Karim’s card words' } },
      })
    ).json().message;
    await karim.post(`/v1/messages/${order.id}/kit`, { to: 'ready' });
    await rana.post(`/v1/messages/${order.id}/kit`, { to: 'collected' });
    // Her own card, moved by someone on the team: she sees the shop move it, as in the app.
    const ticket = (
      await rana.post(
        `/v1/conversations/${customer}/messages`,
        list('support_ticket', { title: 'Rana’s ticket' }),
      )
    ).message;
    await karim.post(`/v1/messages/${ticket.id}/kit`, { to: 'in_progress' });
    // On the shop's team, Karim takes it and Omid asks for help: each sees their own part.
    await karim.post(`/v1/orgs/${shop}/members`, { userIds: [omid.user.id] });
    await karim.post(`/v1/business/${customer}/assign`, { userId: karim.user.id });
    await omid.post(`/v1/business/${customer}/escalate`, { note: 'Omid’s escalation note' });
    // A file still on its way up is listed, without a link that can't work yet.
    await db
      .insertInto('files')
      .values({
        id: uuidv4(),
        owner_id: rana.user.id,
        storage_key: `test/${uuidv4()}`,
        name: 'half.mov',
        mime: 'video/quicktime',
        size: 1000,
        kind: 'video',
        status: 'uploading',
      })
      .execute();

    // Her plan changed by the people who run Caishy: recorded, without where they did it from.
    t.ctx.config.ADMIN_TOKEN = 'operator-token';
    const plan = await t.app.inject({
      method: 'PUT',
      url: `/v1/admin/people/${rana.user.handle}/plan`,
      payload: { plan: 'pro' },
      headers: { authorization: 'Bearer operator-token' },
    });
    t.ctx.config.ADMIN_TOKEN = undefined;
    expect(plan.statusCode).toBe(200);
    await t.ctx.flush();

    const archive = (await rana.req('GET', '/v1/me/export')).json();
    const text = JSON.stringify(archive);
    expect(archive.account.joinedThrough).toEqual({ person: true });
    expect(archive.notificationRules.filter((r: any) => r.scope.person)).toEqual([
      expect.objectContaining({
        scope: expect.objectContaining({ person: karimAs, organization: null }),
        settings: expect.objectContaining({ notify: 'always' }),
      }),
    ]);
    expect(archive.connectionRequests).toEqual([
      expect.objectContaining({
        person: karimAs,
        status: 'accepted',
        answeredAt: expect.any(String),
      }),
      expect.objectContaining({
        direction: 'sent',
        person: { displayName: 'Dana Lee', handle: dana.user.handle },
        note: 'Rana’s note to Dana',
        status: 'ended',
        answeredAt: null,
      }),
    ]);
    expect(archive.calls).toEqual([
      expect.objectContaining({ direction: 'outgoing', with: karimAs, outcome: 'unanswered' }),
    ]);
    const line = archive.messages.find((m: any) => m.payload?.event === 'call');
    expect(line.payload).toMatchObject({ outcome: 'unanswered', kind: 'voice' });

    const card = archive.messages.find((m: any) => m.id === hers.id);
    expect(card.payload.fields.items).toEqual([
      expect.objectContaining({ id: 'i1', text: 'Tickets', done: true, doneBy: null }),
      expect.objectContaining({ text: 'Passport', addedBy: rana.user.id, done: false }),
    ]);
    expect(archive.yourItemsOnOthersChecklists).toEqual([
      {
        checklistMessageId: his.id,
        conversationId: dm,
        text: 'Rana’s item',
        done: false,
        doneByYou: false,
      },
    ]);

    // (What she called it is in the line she wrote making it: that was hers.)
    const left = archive.conversations.find((c: any) => c.id === group);
    expect(left).toMatchObject({ kind: 'group', leftAt: expect.any(String) });
    expect(left).not.toHaveProperty('title');
    expect(archive.contexts.map((c: any) => c.title)).toEqual(['Rana’s own plan']);
    expect(archive.spaces).toEqual([
      expect.objectContaining({ kind: 'community', madeByYou: true, leftAt: expect.any(String) }),
    ]);
    expect(archive.spaces[0]).not.toHaveProperty('name');
    expect(archive.files).toEqual([
      expect.objectContaining({ name: 'half.mov', status: 'uploading', url: null }),
    ]);

    expect(archive.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Rana Studio',
          madeByYou: true,
          leftAt: expect.any(String),
        }),
      ]),
    );
    expect(archive.organizationAppsYouMade).toEqual([
      { organization: 'Rana Studio', createdAt: expect.any(String) },
      { organization: 'Karim’s Lab', createdAt: expect.any(String) },
    ]);
    expect(archive.updatesYouPosted).toEqual([
      expect.objectContaining({ body: null, editedAt: expect.any(String) }),
      expect.objectContaining({ body: 'Rana’s other update', editedAt: null }),
    ]);

    expect(archive.businessConversations).toEqual([
      {
        organization: { name: 'Karim’s Shop', handle: expect.any(String) },
        conversationId: customer,
        as: 'customer',
        startedAt: expect.any(String),
      },
    ]);
    const mine = archive.messages.find((m: any) => m.id === ticket.id);
    expect(mine.payload.history).toEqual([expect.objectContaining({ by: shop })]);
    expect(JSON.stringify(mine)).not.toContain(karim.user.id);
    const copies = archive.copiesForOrganizationsApps;
    expect(copies).toEqual([
      expect.objectContaining({
        organization: 'Karim’s Shop',
        app: 'Shop sync',
        event: 'business.message',
        status: 'pending',
        message: { id: expect.any(String), kind: 'text', body: 'Rana asks the shop' },
        card: null,
      }),
      expect.objectContaining({
        event: 'kit.moved',
        message: null,
        card: {
          messageId: order.id,
          kit: 'Order',
          state: 'ready',
          moved: { from: 'placed', to: 'ready' },
          byYou: false,
        },
      }),
      expect.objectContaining({
        event: 'kit.moved',
        message: null,
        card: {
          messageId: order.id,
          kit: 'Order',
          state: 'collected',
          moved: { from: 'ready', to: 'collected' },
          byYou: true,
        },
      }),
      // Her ticket: a message of hers, with no words of its own.
      expect.objectContaining({
        event: 'business.message',
        message: { id: ticket.id, kind: 'kit', body: null },
        card: null,
      }),
    ]);

    expect(archive.securityRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'plan.changed',
          byYou: false,
          networkAddress: null,
          browser: null,
          details: expect.objectContaining({ to: 'pro' }),
        }),
      ]),
    );
    for (const theirs of [
      yara.user.handle,
      'Yara Young',
      'declined',
      'Karim’s first item',
      'Karim’s addition',
      'Karim’s new name',
      'Karim’s edit',
      'Rana’s trip',
      'karims-secret-path',
      'lab-since',
      'Karim’s rewrite',
      'Karim’s space name',
      'Omid’s escalation note',
      'Karim’s card words',
    ])
      expect(text).not.toContain(theirs);

    // Karim's: it's his; that Omid asked for help, never what Omid wrote.
    const team = (await karim.req('GET', '/v1/me/export')).json();
    expect(team.businessConversations).toEqual([
      expect.objectContaining({
        conversationId: customer,
        as: 'team',
        handedToYou: true,
        escalatedByYou: false,
        escalatedAt: expect.any(String),
        escalationNote: null,
        resolvedByYou: false,
      }),
    ]);
    expect(JSON.stringify(team)).not.toContain('Omid’s escalation note');
    const omids = (await omid.req('GET', '/v1/me/export')).json();
    expect(omids.businessConversations).toEqual([
      expect.objectContaining({ escalatedByYou: true, escalationNote: 'Omid’s escalation note' }),
    ]);
  });

  it('deletes an account only with its password, and leaves others a consistent history', async () => {
    // What Hassan leaves behind: a file only he can see, his photo, a file he shared with Sarah,
    // his own action, and one Sarah is waiting on him for.
    const draft = await upload(hassan, 'draft.jpg');
    const avatar = await upload(hassan, 'me.jpg');
    await hassan.patch('/v1/me', { avatarFileId: avatar.id });
    const shared = await upload(hassan, 'plan.jpg');
    await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'media',
      body: 'The plan',
      fileIds: [shared.id],
    });
    const own = (await hassan.post('/v1/tasks', { title: 'Book flights' })).task;
    const waiting = (
      await sarah.post('/v1/tasks', {
        title: 'Send the signed contract',
        assigneeId: hassan.user.id,
      })
    ).task;
    const fileIds = [draft.id, avatar.id, shared.id];
    const stored = await t.ctx.db
      .selectFrom('files')
      .select(['id', 'storage_key'])
      .where('id', 'in', fileIds)
      .execute();
    const onDisk = (id: string) =>
      existsSync(join(t.ctx.config.DATA_DIR, stored.find((f) => f.id === id)!.storage_key));
    expect(fileIds.map(onDisk)).toEqual([true, true, true]);

    const wrong = await hassan.req('DELETE', '/v1/me', { password: 'not the password' });
    expect(wrong.statusCode).toBe(401);
    const done = await hassan.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(done.statusCode).toBe(200);

    // Gone: the session, the sign-in, the profile.
    expect((await hassan.req('GET', '/v1/me')).statusCode).toBe(401);
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        identifier: hassan.user.handle,
        password: 'correct horse battery',
        client: 'native',
      },
    });
    expect(login.statusCode).toBe(401);
    expect((await sarah.req('GET', `/v1/people/${hassan.user.id}`)).statusCode).toBe(404);
    const owned = await t.ctx.db
      .selectFrom('relationships')
      .select('id')
      .where('owner_id', '=', hassan.user.id)
      .execute();
    expect(owned).toEqual([]);
    // The app he made goes with him, for everyone who let it in.
    const apps = await t.ctx.db
      .selectFrom('oauth_clients')
      .select('id')
      .where('owner_id', '=', hassan.user.id)
      .execute();
    expect(apps).toEqual([]);

    // Sarah keeps the conversation: Hassan's words stay, without his name.
    const view = await sarah.get(`/v1/conversations/${convo}`);
    expect(view.conversation.title).toBe('Deleted account');
    const page = await sarah.get(`/v1/conversations/${convo}/messages`);
    const his = page.messages.find((m: any) => m.body === 'From Hassan');
    expect(his.senderId).toBeNull();
    expect((await sarah.get('/v1/connections')).connections).toEqual([]);

    // Files nobody else could see are gone from the database and the disk; the shared one stays.
    const left = await t.ctx.db
      .selectFrom('files')
      .select(['id', 'owner_id'])
      .where('id', 'in', fileIds)
      .execute();
    expect(left).toEqual([{ id: shared.id, owner_id: null }]);
    expect(fileIds.map(onDisk)).toEqual([false, false, true]);
    const file = await t.app.inject({
      method: 'GET',
      url: shared.url,
      headers: { authorization: `Bearer ${sarah.token}` },
    });
    expect(file.statusCode).toBe(200);

    // His own action went with him; the one Sarah waits on stays on her list, assigned to nobody.
    const tasks = await t.ctx.db
      .selectFrom('tasks')
      .select('id')
      .where('id', 'in', [own.id, waiting.id])
      .execute();
    expect(tasks).toEqual([{ id: waiting.id }]);
    const list = await sarah.get('/v1/tasks?view=waiting');
    expect(list.tasks).toEqual([
      expect.objectContaining({
        id: waiting.id,
        direction: 'waiting',
        assignee: { id: null, displayName: 'Deleted account' },
      }),
    ]);
    expect(list.counts.waiting).toBe(1);
    const closed = await sarah.patch(`/v1/tasks/${waiting.id}`, { status: 'cancelled' });
    expect(closed.task.status).toBe('cancelled');
  });
});
