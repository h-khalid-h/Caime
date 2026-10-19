/**
 * An organization's intake forms (M16 H5): kept by its owner and admins, read by its team, sent
 * as a Form card by the organization's side alone, a copy of the form as it read; answered on the
 * card by the customer it was sent to, once, each answer checked, the ones kept as customer fields
 * in their record; sent by itself after a booking of an item that names one; in both exports, and
 * gone when a closed organization is cleared; never in what a model reads.
 */
import { type IntakeForm, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { messagePreview } from '../src/lib/messages';
import { clearClosedOrg } from '../src/lib/org-data';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const DAY = 86_400_000;
const CHECKUP = {
  id: 'checkup',
  name: 'Check-up',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};
// Open every day, all day, so the test finds a time whenever it runs.
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:30' })),
  leadMinutes: 0,
  horizonDays: 14,
};

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let sara: Client; // nobody to it
let orgId: string;
let linaConvo: string;
let fileField: string;
let insurerField: string;
let form: IntakeForm;

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const sendCard = (c: Client, conversationId: string, payload: Record<string, unknown>) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload,
  });
const sendForm = (c: Client, conversationId: string, formId: string) =>
  sendCard(c, conversationId, { kit: 'form', fields: {}, form: { formId } });
const answer = (c: Client, messageId: string, answers: Record<string, string>) =>
  c.req('POST', `/v1/messages/${messageId}/answers`, { answers });
const saveForms = (c: Client, forms: unknown[]) =>
  c.req('PUT', `/v1/orgs/${orgId}/forms`, { forms });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
const q = (label: string) => {
  const found = form.questions.find((x) => x.label === label);
  if (!found) throw new Error(`no question ${label}`);
  return found.id;
};
/** The message's effects, then the jobs they queued. */
async function settle() {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
  await t.ctx.flush();
}

beforeAll(async () => {
  t = await createTestApp();
  // Slots are read on the server's clock and messages take the database's: one time for both.
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
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
  const fields = (
    await noor.req('PUT', `/v1/orgs/${orgId}/customer-fields`, {
      fields: [
        { label: 'File number', kind: 'number' },
        { label: 'Insurer', kind: 'choice', choices: ['AXA', 'Allianz'] },
      ],
    })
  ).json().fields as Array<{ id: string; label: string }>;
  fileField = fields.find((f) => f.label === 'File number')?.id ?? '';
  insurerField = fields.find((f) => f.label === 'Insurer')?.id ?? '';
  linaConvo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await say(lina, linaConvo, 'Hello, I need a check-up.');
});

afterAll(async () => {
  await t.close();
});

describe('intake forms (M16 H5)', () => {
  it('are kept by the owner and admins, and read by the team alone', async () => {
    const forms = [
      {
        name: 'Before your visit',
        intro: 'So the dentist knows.',
        questions: [
          { label: 'Any allergies?', kind: 'longtext', required: true },
          { label: 'File number', kind: 'number', required: false, keepAs: fileField },
          // Kept in a choice field, it asks that field's choices whatever it was given.
          {
            label: 'Insurer',
            kind: 'choice',
            choices: ['Anything'],
            required: false,
            keepAs: insurerField,
          },
          { label: 'First visit?', kind: 'yesno', required: true },
        ],
      },
    ];
    expect((await saveForms(omar, forms)).statusCode).toBe(403);
    expect((await saveForms(sara, forms)).statusCode).toBe(404);
    // A question kept in a field of another kind, a choice without choices, a form without
    // questions: each refused.
    const bad = [
      [{ label: 'Allergies', kind: 'longtext', required: false, keepAs: fileField }],
      [{ label: 'Colour', kind: 'choice', required: false }],
      [],
    ];
    for (const questions of bad)
      expect((await saveForms(noor, [{ name: 'Bad', questions }])).statusCode).toBe(400);
    const saved = await saveForms(noor, forms);
    expect(saved.statusCode, saved.body).toBe(200);
    form = (saved.json().forms as IntakeForm[])[0] as IntakeForm;
    expect(form).toMatchObject({ name: 'Before your visit', intro: 'So the dentist knows.' });
    expect(form.questions.find((x) => x.label === 'Insurer')).toMatchObject({
      choices: ['AXA', 'Allianz'],
      keepAs: insurerField,
    });
    // Saved again, a form and its questions keep their ids; an id not its own is new.
    const again = await saveForms(noor, [
      { ...forms[0], id: form.id, questions: form.questions },
      {
        id: uuidv4(),
        name: 'Car details',
        questions: [{ label: 'Plate', kind: 'text', required: true }],
      },
    ]);
    const kept = again.json().forms as IntakeForm[];
    expect(kept[0]?.id).toBe(form.id);
    expect(kept[0]?.questions.map((x) => x.id)).toEqual(form.questions.map((x) => x.id));
    expect(kept).toHaveLength(2);
    await saveForms(noor, [{ ...forms[0], id: form.id, questions: form.questions }]);
    expect((await omar.get(`/v1/orgs/${orgId}/forms`)).forms).toHaveLength(1);
    expect((await lina.req('GET', `/v1/orgs/${orgId}/forms`)).statusCode).toBe(404);
    // The team's view of a customer's conversation names them; the customer's names none.
    expect((await omar.get(`/v1/conversations/${linaConvo}`)).conversation.business.forms).toEqual([
      { id: form.id, name: 'Before your visit' },
    ]);
    expect(
      (await lina.get(`/v1/conversations/${linaConvo}`)).conversation.business.forms,
    ).toBeNull();
  });

  it('is sent as a Form card by the organization’s side alone, a copy of the form', async () => {
    expect((await sendForm(lina, linaConvo, form.id)).statusCode).toBe(400);
    expect((await sendForm(omar, linaConvo, uuidv4())).statusCode).toBe(400);
    // Between two people, nobody sends a form.
    const r = await omar.post('/v1/connections/requests', { toUserId: sara.user.id });
    await sara.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    const direct = (await omar.post('/v1/conversations', { kind: 'direct', userId: sara.user.id }))
      .conversation.id;
    expect((await sendForm(omar, direct, form.id)).statusCode).toBe(400);

    const sent = await sendForm(omar, linaConvo, form.id);
    expect(sent.statusCode, sent.body).toBe(201);
    const card = sent.json().message;
    expect(card.payload).toMatchObject({
      kit: 'form',
      title: 'Before your visit',
      state: 'sent',
      form: { id: form.id, name: 'Before your visit' },
    });
    // The customer sees it from the organization, asked of them.
    const seen = (await messages(lina, linaConvo)).find((m) => m.id === card.id);
    expect(seen.payload.form.questions).toHaveLength(4);
    expect(seen.isRequest).toBe(true);
  });

  it('is answered on the card by its customer, once, each answer checked', async () => {
    const card = (await messages(omar, linaConvo)).find((m) => m.payload?.kit === 'form');
    expect((await answer(omar, card.id, { [q('First visit?')]: 'yes' })).statusCode).toBe(403);
    const missing = await answer(lina, card.id, { [q('First visit?')]: 'yes' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.message).toContain('Any allergies?');
    expect(
      (
        await answer(lina, card.id, {
          [q('Any allergies?')]: 'None',
          [q('First visit?')]: 'maybe',
        })
      ).statusCode,
    ).toBe(400);
    const done = await answer(lina, card.id, {
      [q('Any allergies?')]: 'Penicillin',
      [q('File number')]: '١٢٣٤',
      [q('Insurer')]: 'axa',
      [q('First visit?')]: 'yes',
    });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().message.payload).toMatchObject({
      state: 'answered',
      answers: {
        [q('Any allergies?')]: 'Penicillin',
        [q('File number')]: '1234',
        [q('Insurer')]: 'AXA',
        [q('First visit?')]: 'yes',
      },
    });
    expect(done.json().message.isRequest).toBe(false);
    // To her the card is the organization's: nobody on its team is named in what she gets back.
    expect(done.body).not.toContain(omar.user.id);
    expect(done.body).not.toContain('Omar');
    // Once.
    expect(
      (await answer(lina, card.id, { [q('Any allergies?')]: 'x', [q('First visit?')]: 'no' }))
        .statusCode,
    ).toBe(400);
    // What the form keeps in customer fields is in her record now, for the team.
    const record = (await omar.get(`/v1/orgs/${orgId}/customers/${lina.user.id}`)).record;
    expect(record.fields).toEqual({ [fileField]: '1234', [insurerField]: 'AXA' });
    // A model reading the conversation reads the card's name, never the answers.
    const row = await t.ctx.db
      .selectFrom('messages')
      .select(['kind', 'body', 'payload', 'deleted_at'])
      .where('id', '=', card.id)
      .executeTakeFirstOrThrow();
    expect(messagePreview(row)).toBe('Form: Before your visit');
  });

  it('keeps the form as it was sent when the form changes', async () => {
    await saveForms(noor, [
      {
        id: form.id,
        name: 'Renamed',
        questions: [{ label: 'Only this', kind: 'text', required: true }],
      },
    ]);
    const card = (await messages(lina, linaConvo)).find((m) => m.payload?.kit === 'form');
    expect(card.payload.form.name).toBe('Before your visit');
    expect(card.payload.form.questions).toHaveLength(4);
    await saveForms(noor, [{ ...form, intro: form.intro ?? null }]);
  });

  it('follows a booking of an item that names it, once, from the organization', async () => {
    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      // A form that isn't one of the organization's is let go.
      items: [
        { ...CHECKUP, formId: form.id },
        { ...CHECKUP, id: 'cleaning', name: 'Cleaning', formId: uuidv4() },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().items.map((i: { formId: string | null }) => i.formId)).toEqual([
      form.id,
      null,
    ]);
    const window = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 3 * DAY).toISOString()}`;
    const slots = (await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=checkup`))
      .slots as string[];
    const booked = await sendCard(lina, linaConvo, {
      kit: 'appointment',
      fields: { title: 'Check-up', start: { at: slots[0], hasTime: true } },
      booking: { itemId: 'checkup', quantity: 1 },
    });
    expect(booked.statusCode, booked.body).toBe(201);
    const bookingId = booked.json().message.id as string;
    await settle();
    // Run again, it posts nothing more.
    await t.ctx.db
      .insertInto('jobs')
      .values({
        kind: 'org.reply',
        payload: JSON.stringify({
          what: 'form',
          orgId,
          conversationId: linaConvo,
          messageId: bookingId,
          formId: form.id,
        }),
        run_at: new Date(t.ctx.now().getTime() - 1000),
      })
      .execute();
    await settle();
    const followed = (await messages(lina, linaConvo)).filter(
      (m) => m.payload?.kit === 'form' && m.replyTo?.id === bookingId,
    );
    expect(followed).toHaveLength(1);
    expect(followed[0]).toMatchObject({ automated: true, payload: { state: 'sent' } });
    // A booking of an item without one sends nothing.
    const plain = await sendCard(lina, linaConvo, {
      kit: 'appointment',
      fields: { title: 'Cleaning', start: { at: slots[1], hasTime: true } },
      booking: { itemId: 'cleaning', quantity: 1 },
    });
    await settle();
    expect(
      (await messages(lina, linaConvo)).filter((m) => m.replyTo?.id === plain.json().message.id),
    ).toEqual([]);
  });

  it('is in both exports, and goes when a closed organization is cleared', async () => {
    const mine = (await lina.req('GET', '/v1/me/export')).json();
    expect(mine.yourAnswersToForms).toEqual([
      expect.objectContaining({
        form: 'Before your visit',
        answers: expect.arrayContaining([{ question: 'Any allergies?', answer: 'Penicillin' }]),
      }),
    ]);
    const owner = await signup(t, { displayName: 'Dina Owner' });
    const id = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Brief Cafe',
        handle: 'brief.cafe',
        kind: 'shop',
      })
    ).org.id;
    await owner.req('PUT', `/v1/orgs/${id}/forms`, {
      forms: [{ name: 'Allergies', questions: [{ label: 'Any?', kind: 'text', required: false }] }],
    });
    await owner.post(`/v1/orgs/${id}/close`, {});
    expect((await owner.get(`/v1/orgs/${id}/export`)).forms).toMatchObject([{ name: 'Allergies' }]);
    t.clock.advance(31 * DAY);
    try {
      expect(await clearClosedOrg(t.ctx, id)).toBe(true);
    } finally {
      t.clock.advance(-31 * DAY);
    }
    expect(
      await t.ctx.db.selectFrom('org_forms').select('id').where('org_id', '=', id).execute(),
    ).toEqual([]);
  });
});
