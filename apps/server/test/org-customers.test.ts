/**
 * What an organization's team keeps about its customers (M16 H3): fields its owner and admins
 * define, a note, tags and the fields' values on a customer, kept by anyone on the team and
 * never shown to the customer; tags on the inbox's rows and its filter; gone with an erasure,
 * an account deleted, a field taken away and a closed organization cleared; in the export.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { clearClosedOrg } from '../src/lib/org-data';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let rana: Client; // another customer
let sara: Client; // nobody to it
let orgId: string;
let linaConvo: string;
let fileId: string;
let foundId: string;
const heard: BusMessage[] = [];

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const record = (c: Client, customerId: string) =>
  c.req('GET', `/v1/orgs/${orgId}/customers/${customerId}`);
const keep = (c: Client, customerId: string, body: unknown) =>
  c.req('PATCH', `/v1/orgs/${orgId}/customers/${customerId}`, body);
const inbox = async (c: Client, query = 'view=customer_waiting') =>
  (await c.get(`/v1/orgs/${orgId}/inbox?${query}`)) as {
    threads: Array<{ conversationId: string; customerTags: string[] }>;
    counts: Record<string, number>;
  };

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  rana = await signup(t, { displayName: 'Rana Said' });
  sara = await signup(t, { displayName: 'Sara Ali' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  linaConvo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await send(lina, linaConvo, 'Hello, can I book a check-up?');
  const ranaConvo = (await rana.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await send(rana, ranaConvo, 'Do you do whitening?');
});

afterAll(async () => {
  await t.close();
});

describe('what a team keeps about its customers (M16 H3)', () => {
  it('has fields its owner and admins define, which its team reads and nobody else', async () => {
    const fields = [
      { label: 'File number', kind: 'number' },
      { label: 'Found us', kind: 'choice', choices: ['A friend', 'Instagram'] },
      { label: 'Insurance', kind: 'text' },
    ];
    expect(
      (await omar.req('PUT', `/v1/orgs/${orgId}/customer-fields`, { fields })).statusCode,
    ).toBe(403);
    expect(
      (
        await noor.req('PUT', `/v1/orgs/${orgId}/customer-fields`, {
          fields: [{ label: 'Found us', kind: 'choice' }],
        })
      ).statusCode,
    ).toBe(400);
    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/customer-fields`, { fields });
    expect(saved.statusCode).toBe(200);
    const kept = saved.json().fields as Array<{ id: string; label: string }>;
    expect(kept.map((f) => f.label)).toEqual(['File number', 'Found us', 'Insurance']);
    fileId = kept[0]?.id ?? '';
    foundId = kept[1]?.id ?? '';
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.customerFields).toEqual(kept);
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.customerFields).toBeNull();
  });

  it('keeps a note, tags and fields on a customer for the team alone', async () => {
    heard.length = 0;
    const res = await keep(omar, lina.user.id, {
      note: 'Prefers mornings. Nervous about needles.',
      tags: ['VIP', 'vip', ' New patient '],
      fields: { [fileId]: '١٢٣٤', [foundId]: 'instagram' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().record).toMatchObject({
      customerId: lina.user.id,
      note: 'Prefers mornings. Nervous about needles.',
      tags: ['VIP', 'New patient'],
      fields: { [fileId]: '1234', [foundId]: 'Instagram' },
      updatedBy: { userId: omar.user.id, displayName: 'Omar Farouk' },
    });
    // A value its kind can't hold, and a field that isn't the organization's, are refused.
    expect((await keep(omar, lina.user.id, { fields: { [fileId]: 'twelve' } })).statusCode).toBe(
      400,
    );
    expect((await keep(omar, lina.user.id, { fields: { nope: 'x' } })).statusCode).toBe(400);
    // Only for someone who's its customer, and only to its team.
    expect((await keep(omar, sara.user.id, { note: 'x' })).statusCode).toBe(404);
    expect((await record(lina, lina.user.id)).statusCode).toBe(404);
    expect((await record(sara, lina.user.id)).statusCode).toBe(404);
    expect((await record(noor, lina.user.id)).json().record.tags).toEqual(['VIP', 'New patient']);
    // The team's devices hear which customer's record changed; Lina hears nothing of it.
    await busSettled(t, heard);
    const told = heard.filter(
      (m) =>
        m.event.type === 'business.updated' &&
        (m.event.data as Record<string, unknown>).customerId === lina.user.id,
    );
    expect(told.length).toBeGreaterThan(0);
    expect(told.flatMap((m) => m.userIds)).not.toContain(lina.user.id);
    // Nothing of it reaches the customer's own views.
    const hers = JSON.stringify([
      await lina.get(`/v1/conversations/${linaConvo}`),
      await lina.get(`/v1/conversations/${linaConvo}/messages`),
      await lina.get('/v1/inbox?view=all'),
    ]);
    expect(hers).not.toContain('Prefers mornings');
    expect(hers).not.toContain('New patient');
  });

  it('shows the tags on the inbox’s rows, and filters the inbox by one', async () => {
    const all = await inbox(noor);
    expect(all.threads.find((x) => x.conversationId === linaConvo)?.customerTags).toEqual([
      'VIP',
      'New patient',
    ]);
    expect(all.threads.filter((x) => x.customerTags.length === 0)).toHaveLength(1);
    const vip = await inbox(noor, 'view=customer_waiting&tag=VIP');
    expect(vip.threads.map((x) => x.conversationId)).toEqual([linaConvo]);
    expect(vip.counts.customer_waiting).toBe(1);
    expect((await omar.get(`/v1/orgs/${orgId}/customer-tags`)).tags).toEqual([
      { tag: 'New patient', count: 1 },
      { tag: 'VIP', count: 1 },
    ]);
    expect((await lina.req('GET', `/v1/orgs/${orgId}/customer-tags`)).statusCode).toBe(404);
  });

  it('lets a field go with every customer’s value for it', async () => {
    const fields = (await noor.get(`/v1/orgs/${orgId}`)).org.customerFields as Array<{
      id: string;
      label: string;
      kind: string;
    }>;
    await noor.req('PUT', `/v1/orgs/${orgId}/customer-fields`, {
      fields: fields.filter((f) => f.id !== foundId),
    });
    expect((await record(omar, lina.user.id)).json().record.fields).toEqual({ [fileId]: '1234' });
  });

  it('goes when the customer’s conversation is erased at their request, or their account is', async () => {
    expect(
      (await noor.req('DELETE', `/v1/orgs/${orgId}/conversations/${linaConvo}`)).statusCode,
    ).toBe(200);
    const left = await t.ctx.db
      .selectFrom('org_customers')
      .select('customer_id')
      .where('org_id', '=', orgId)
      .where('customer_id', '=', lina.user.id)
      .execute();
    expect(left).toEqual([]);
    // Rana's goes with her account.
    await keep(omar, rana.user.id, { tags: ['Wholesale'] });
    expect(
      (await rana.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    const gone = await t.ctx.db
      .selectFrom('org_customers')
      .select('customer_id')
      .where('customer_id', '=', rana.user.id)
      .execute();
    expect(gone).toEqual([]);
  });

  it('is in a closed organization’s export, and goes when it is cleared', async () => {
    const owner = await signup(t, { displayName: 'Dina Owner' });
    const id = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Brief Cafe',
        handle: 'brief.cafe',
        kind: 'shop',
      })
    ).org.id;
    const fields = (
      await owner.req('PUT', `/v1/orgs/${id}/customer-fields`, {
        fields: [{ label: 'Usual', kind: 'text' }],
      })
    ).json().fields as Array<{ id: string }>;
    const guest = await signup(t, { displayName: 'Hana Guest' });
    const convo = (await guest.post(`/v1/orgs/${id}/conversations`, {})).conversationId;
    await send(guest, convo, 'One flat white, please.');
    await owner.req('PATCH', `/v1/orgs/${id}/customers/${guest.user.id}`, {
      note: 'Oat milk',
      tags: ['Regular'],
      fields: { [fields[0]?.id ?? '']: 'Flat white' },
    });
    await owner.post(`/v1/orgs/${id}/close`, {});
    const exported = await owner.get(`/v1/orgs/${id}/export`);
    expect(exported.customers.fields).toEqual(fields);
    expect(exported.customers.records).toMatchObject([
      {
        customerId: guest.user.id,
        displayName: 'Hana Guest',
        note: 'Oat milk',
        tags: ['Regular'],
        fields: { [fields[0]?.id ?? '']: 'Flat white' },
      },
    ]);
    t.clock.advance(31 * 86_400_000);
    try {
      expect(await clearClosedOrg(t.ctx, id)).toBe(true);
    } finally {
      t.clock.advance(-31 * 86_400_000);
    }
    expect(
      await t.ctx.db
        .selectFrom('org_customers')
        .select('customer_id')
        .where('org_id', '=', id)
        .execute(),
    ).toEqual([]);
    const org = await t.ctx.db
      .selectFrom('organizations')
      .select('customer_fields')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(org.customer_fields).toEqual([]);
  });
});
