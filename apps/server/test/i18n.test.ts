/**
 * The server writes for whoever reads (R54, ADR-17): a request is answered in the language its
 * app shows (`X-Caime-Language`), and a notification in its reader's own, whatever device or
 * person set it off.
 */
import { uuidv4 } from '@caime/core';
import { fill } from '@caime/core/i18n';
import { ar } from '@caime/core/locales/ar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arServer } from '../src/locales/ar-server';
import { frServer } from '../src/locales/fr-server';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let noor: Client;

const arabic = (key: string, vars?: Record<string, string | number>) => {
  const entry = ar[key] ?? arServer[key];
  if (!entry) throw new Error(`no Arabic for ${JSON.stringify(key)}`);
  return fill(typeof entry === 'string' ? entry : entry.other, vars);
};
const french = (key: string, vars?: Record<string, string | number>) => {
  const entry = frServer[key];
  if (!entry) throw new Error(`no French for ${JSON.stringify(key)}`);
  return fill(typeof entry === 'string' ? entry : entry.other, vars);
};

const titlesFor = async (userId: string) => {
  // What a message sets off is written after its answer.
  await t.ctx.flush();
  return (
    await t.ctx.db
      .selectFrom('notifications')
      .select(['title', 'body', 'reason'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute()
  ).map((n) => n.title);
};

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid', handle: 'hassan', email: 'h@datac.io' });
  noor = await signup(t, { displayName: 'Noor Adel', handle: 'noor', email: 'noor@datac.io' });
});
afterAll(async () => {
  await t.close();
});

describe('a request is answered in the language its app shows', () => {
  it('connects two people, labelled', async () => {
    const res = await hassan.post('/v1/connections/requests', {
      toUserId: noor.user.id,
      relationship: { sphere: 'friend', role: 'friend' },
    });
    const accepted = await noor.post(`/v1/connections/requests/${res.requestId}/accept`, {});
    expect(accepted.conversationId).toBeTruthy();
  });

  it('labels a relationship in Arabic for an Arabic app, in English otherwise', async () => {
    const english = await hassan.get('/v1/connections');
    expect(english.connections[0].relationships[0].label).toBe('Friend');
    const arabicApp = await hassan.get('/v1/connections', {
      headers: { 'x-caime-language': 'ar' },
    });
    expect(arabicApp.connections[0].relationships[0].label).toBe(arabic('Friend'));
    // A device's tag reads as its language; nonsense reads as English.
    const tagged = await hassan.get('/v1/connections', {
      headers: { 'x-caime-language': 'ar-EG' },
    });
    expect(tagged.connections[0].relationships[0].label).toBe(arabic('Friend'));
    const nonsense = await hassan.get('/v1/connections', {
      headers: { 'x-caime-language': 'xx-YY' },
    });
    expect(nonsense.connections[0].relationships[0].label).toBe('Friend');
  });
});

describe('a refusal is written in the language the app shows', () => {
  it('a 404 and a 400 read in Arabic, in French, and in English for an app that says nothing', async () => {
    const gone = `/v1/conversations/${uuidv4()}`;
    const english = await hassan.req('GET', gone);
    expect(english.statusCode).toBe(404);
    expect(english.json().error.message).toBe('That conversation wasn’t found.');
    const inArabic = await hassan.req('GET', gone, undefined, { 'x-caime-language': 'ar' });
    expect(inArabic.statusCode).toBe(404);
    expect(inArabic.json().error).toMatchObject({
      code: 'not_found',
      message: arabic('{what} wasn’t found.', { what: arabic('That conversation') }),
    });
    const inFrench = await hassan.req('GET', gone, undefined, { 'x-caime-language': 'fr-FR' });
    expect(inFrench.json().error.message).toBe(
      french('{what} wasn’t found.', { what: french('That conversation') }),
    );
    // A rule's refusal too, built where it's thrown.
    const self = await hassan.req(
      'POST',
      '/v1/connections/requests',
      { toUserId: hassan.user.id },
      { 'x-caime-language': 'ar' },
    );
    expect(self.statusCode).toBe(400);
    expect(self.json().error.message).toBe(arabic('That’s you.'));
  });
});

describe('a notification is written in its reader’s language', () => {
  it('the reader chose Arabic: told in Arabic, whatever the sender’s app shows', async () => {
    const sara = await signup(t, { displayName: 'Sara Ali', handle: 'sara', email: 's@datac.io' });
    await noor.patch('/v1/me', { preferences: { language: 'ar' } });
    await sara.post('/v1/connections/requests', { toUserId: noor.user.id });
    expect(await titlesFor(noor.user.id)).toContain(
      arabic('{name} wants to connect with you', { name: 'Sara Ali' }),
    );
    // Sara, whose app says nothing of a language, hears back in English.
    const requests = await noor.get('/v1/connections/requests?direction=incoming');
    const theirs = requests.requests.find(
      (r: { person: { id: string } }) => r.person.id === sara.user.id,
    );
    await noor.post(`/v1/connections/requests/${theirs.id}/accept`, {});
    expect(await titlesFor(sara.user.id)).toContain('Noor Adel accepted your request');
  });

  it('“auto” follows what the reader’s app last showed, and a change is heard at once', async () => {
    const omar = await signup(t, { displayName: 'Omar Said', handle: 'omar', email: 'o@datac.io' });
    await noor.patch('/v1/me', { preferences: { language: 'auto', interfaceLanguage: 'ar' } });
    await omar.post('/v1/connections/requests', { toUserId: noor.user.id });
    expect(await titlesFor(noor.user.id)).toContain(
      arabic('{name} wants to connect with you', { name: 'Omar Said' }),
    );
    // Back to English (the cache of their language is dropped with the change).
    await noor.patch('/v1/me', { preferences: { language: 'en' } });
    const lina = await signup(t, {
      displayName: 'Lina Fouad',
      handle: 'lina',
      email: 'l@datac.io',
    });
    await lina.post('/v1/connections/requests', { toUserId: noor.user.id });
    expect(await titlesFor(noor.user.id)).toContain('Lina Fouad wants to connect with you');
  });

  it('a burst of messages counts in the reader’s language, plural forms and all', async () => {
    await noor.patch('/v1/me', { preferences: { language: 'ar' } });
    const { connections } = await hassan.get('/v1/connections');
    const conversationId = connections.find(
      (c: { person: { id: string } }) => c.person.id === noor.user.id,
    ).conversationId;
    for (let i = 0; i < 3; i++)
      await hassan.post(`/v1/conversations/${conversationId}/messages`, {
        kind: 'text',
        body: `Hello ${i}`,
        clientId: uuidv4(),
      });
    const titles = await titlesFor(noor.user.id);
    // Three messages: Arabic's "few" form, with the sender's name.
    const entry = arServer['{senderName} sent {n} messages{context}'];
    if (!entry || typeof entry === 'string') throw new Error('expected plural forms');
    expect(titles).toContain(
      fill(entry.few ?? entry.other, { senderName: 'Hassan Khalid', n: 3, context: '' }),
    );
    await noor.patch('/v1/me', { preferences: { language: 'en' } });
  });
});

describe('a suggestion is written in its reader’s language', () => {
  it('the reader’s copy is Arabic, the sender’s own is English, from the same message', async () => {
    await noor.patch('/v1/me', { preferences: { language: 'ar' } });
    const { connections } = await hassan.get('/v1/connections');
    const conversationId = connections.find(
      (c: { person: { id: string } }) => c.person.id === noor.user.id,
    ).conversationId;
    await hassan.post(`/v1/conversations/${conversationId}/messages`, {
      kind: 'text',
      body: 'I will send the deck on Monday.',
      clientId: uuidv4(),
    });
    await t.ctx.flush();
    const rows = await t.ctx.db
      .selectFrom('suggestions')
      .select(['user_id', 'kind', 'title', 'rationale'])
      .where('conversation_id', '=', conversationId)
      .execute();
    const theirs = rows.find((r) => r.user_id === noor.user.id && r.kind === 'waiting');
    expect(theirs?.rationale).toBe(
      arabic('{senderName} wrote {quote}', {
        senderName: 'Hassan',
        quote: '“I will send the deck on Monday.”',
      }),
    );
    const mine = rows.find((r) => r.user_id === hassan.user.id && r.kind === 'reminder');
    expect(mine?.rationale).toBe('You wrote “I will send the deck on Monday.”');
    await noor.patch('/v1/me', { preferences: { language: 'en' } });
  });
});
