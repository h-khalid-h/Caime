/**
 * A files place, links to one's own files, and files read as pages (M16 H6): the files between
 * two people and a space's, as the profile counts them; a link that opens one of your own files
 * for whoever has it, or only for someone signed in, for so many days, until it's taken back or
 * its file, message, conversation or maker no longer stands; and a Word document, a workbook, a
 * deck or words read as a page by the server, escaped, held to its limits, nothing in it run.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { officeBody, wordsBody } from '../src/lib/file-views';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { DOCX, letterDocx, PPTX, patientsXlsx, resultsPptx, XLSX, zipOf } from './office-fixtures';

let t: TestApp;
let dir: string;
let noor: Client;
let omar: Client;
let lina: Client;
let chat: string;
let letter: { id: string; viewUrl: string | null; url: string };
let letterMessage: string;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const DAY = 86_400_000;

function multipart(name: string, mime: string, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function upload(c: Client, name: string, mime: string, data: Buffer) {
  const body = multipart(name, mime, data);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${c.token}` },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string; viewUrl: string | null; url: string };
}

/** A file sent in a conversation: its message's id. */
async function send(c: Client, conversationId: string, fileId: string, body = '') {
  const sent = await c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'file',
    body,
    fileIds: [fileId],
  });
  return sent.message.id as string;
}

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
};
const visit = (url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url, headers: { accept: PAGE, ...headers } });
const anon = (url: string) => t.app.inject({ method: 'GET', url });
const pathOf = (url: string) => url.replace('https://caime.example', '');

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-files-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Stranger', handle: 'lina' });
  chat = await connect(noor, omar);
  letter = await upload(noor, 'Before your visit.docx', DOCX, letterDocx());
  letterMessage = await send(noor, chat, letter.id, 'The letter');
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a file read as a page', () => {
  it('reads a document’s words, headings and tables, escaped', async () => {
    const body = await officeBody(letterDocx(), 'docx');
    expect(body?.cut).toBe(false);
    // The file's name is the page's one h1; the document's title sits under it.
    expect(body?.html).toContain('<h2 dir="auto">Before your visit</h2>');
    expect(body?.html).not.toContain('<h1');
    expect(body?.html).toContain('<h2 dir="auto">Allergies</h2>');
    expect(body?.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; medicines.');
    expect(body?.html).not.toContain('<script>');
    expect(body?.html).toContain('<td dir="auto">Aspirin</td><td dir="auto">100 mg</td>');
    expect(body?.html).toContain('مرحبا بك');
  });

  it('reads a workbook’s sheets, shared words, days and yes as they show', async () => {
    const body = await officeBody(patientsXlsx(), 'xlsx');
    expect(body?.html).toContain('<h2 dir="auto">Patients</h2>');
    expect(body?.html).toContain('<td dir="auto">Lina Farah</td>');
    // 32970 is 7 April 1990 on Excel's clock; a number stays a number.
    expect(body?.html).toContain('<td dir="auto">1990-04-07</td>');
    expect(body?.html).toContain('<td dir="auto">12.5</td>');
    expect(body?.html).toContain('<td dir="auto">TRUE</td>');
    expect(body?.html).toContain('<td dir="auto">note</td>');
    expect(body?.html).toContain('<h2 dir="auto">Empty</h2>');
  });

  it('reads a deck’s slides, each by its number in the reader’s words', async () => {
    const body = await officeBody(resultsPptx(), 'pptx');
    expect(body?.html).toContain('<h2>Slide 1</h2><p dir="auto">Q3 results</p>');
    expect(body?.html).toContain('Up 12%\nin Cairo');
    expect(body?.html).toContain('<h2>Slide 2</h2><p dir="auto">Thanks</p>');
  });

  it('stops where a page stops, and never inflates a part past its ceiling', async () => {
    const paragraph = '<w:p><w:r><w:t>Line</w:t></w:r></w:p>';
    const long = await officeBody(
      zipOf({
        'word/document.xml': `<w:document><w:body>${paragraph.repeat(3200)}</w:body></w:document>`,
      }),
      'docx',
    );
    expect(long?.cut).toBe(true);
    expect((long?.html ?? '').split('<p dir="auto">Line</p>').length - 1).toBe(3000);
    // A zip that says its part is ten bytes, holding seventeen megabytes: never read whole.
    const started = Date.now();
    const bomb = await officeBody(
      zipOf(
        {
          'word/document.xml': `<w:document><w:body>${paragraph.repeat(500_000)}</w:body></w:document>`,
        },
        'word/document.xml',
      ),
      'docx',
    );
    expect(bomb?.html ?? '').toBe('');
    expect(Date.now() - started).toBeLessThan(5_000);
    // Not a zip at all, or not what it says.
    expect(await officeBody(Buffer.from('not a zip'), 'docx')).toBeNull();
    expect((await officeBody(patientsXlsx(), 'docx'))?.html ?? '').toBe('');
  });

  it('reads a list of values by its separator, and words in their encoding', () => {
    const csv = wordsBody(
      Buffer.from('﻿name;city\n"Farah; Lina";"Cairo, ""old"""\nOmar;Alex\n'),
      'csv',
      false,
    );
    expect(csv.html).toContain(
      '<td dir="auto">Farah; Lina</td><td dir="auto">Cairo, &quot;old&quot;</td>',
    );
    expect(csv.html).not.toContain('﻿');
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Merhaba dünya', 'utf16le'),
    ]);
    expect(wordsBody(utf16, 'text', false).html).toContain('Merhaba dünya');
    const western = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    expect(wordsBody(western, 'text', true)).toEqual({
      html: '<pre dir="auto">café</pre>',
      cut: true,
    });
  });

  it('is offered for what it reads, and served only to whoever may read the file', async () => {
    expect(letter.viewUrl).toBe(`/v1/files/${letter.id}/view`);
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#ff8fb1' },
    })
      .png()
      .toBuffer();
    expect((await upload(noor, 'dot.png', 'image/png', png)).viewUrl).toBeNull();
    const page = await omar.req('GET', letter.viewUrl as string);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(String(page.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(String(page.headers['content-security-policy'])).not.toContain('script');
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.body).toContain('Before your visit');
    expect(page.body).toContain('Document · ');
    expect(page.body).toContain(`href="/v1/files/${letter.id}?download=1"`);
    expect(page.body).not.toContain('<script>alert');
    expect((await lina.req('GET', letter.viewUrl as string)).statusCode).toBe(404);
    // In the reader's own words: an Arabic reader's page runs right to left.
    await omar.patch('/v1/me', { preferences: { language: 'ar' } });
    const arabic = await omar.req('GET', letter.viewUrl as string);
    expect(arabic.body).toContain('<html lang="ar" dir="rtl">');
    await omar.patch('/v1/me', { preferences: { language: 'en' } });
  });
});

describe('the files between two people', () => {
  it('lists what they shared together, with who and where, and nothing from elsewhere', async () => {
    const topic = (await noor.post(`/v1/conversations/${chat}/topics`, { title: 'Contract' }))
      .conversationId as string;
    const plan = await upload(omar, 'plan.csv', 'text/csv', Buffer.from('a,b\n1,2\n'));
    await send(omar, topic, plan.id);
    // A file Noor shared with someone else isn't between Noor and Omar.
    const other = await connect(noor, lina);
    const elsewhere = await upload(noor, 'other.txt', 'text/plain', Buffer.from('elsewhere'));
    await send(noor, other, elsewhere.id);
    const files = await noor.get(`/v1/people/${omar.user.id}/files?kind=document,audio`);
    expect(files.assets.map((a: { file: { id: string } }) => a.file.id)).toEqual([
      plan.id,
      letter.id,
    ]);
    const [fromOmar, fromNoor] = files.assets;
    expect(fromOmar).toMatchObject({
      senderName: 'Omar Farouk',
      where: 'Contract',
      conversationId: topic,
      linkable: false,
    });
    expect(fromNoor).toMatchObject({ senderName: 'Noor Haddad', where: null, linkable: true });
    expect(files.counts.document).toBe(2);
    // The same two from Omar's side, and nothing at all of anyone they don't share.
    expect((await omar.get(`/v1/people/${noor.user.id}/files`)).counts.document).toBe(2);
    expect((await lina.get(`/v1/people/${omar.user.id}/files`)).assets).toEqual([]);
    expect((await noor.get(`/v1/people/${noor.user.id}/files`)).assets).toEqual([]);
  });

  it('leaves out what someone deleted for themselves, and a message request still waiting', async () => {
    const note = await upload(noor, 'note.txt', 'text/plain', Buffer.from('hidden'));
    const message = await send(noor, chat, note.id);
    await omar.del(`/v1/messages/${message}?forEveryone=false`);
    const ids = async (c: Client, other: string) =>
      (await c.get(`/v1/people/${other}/files`)).assets.map(
        (a: { file: { id: string } | null }) => a.file?.id,
      );
    expect(await ids(omar, noor.user.id)).not.toContain(note.id);
    expect(await ids(noor, omar.user.id)).toContain(note.id);
  });
});

describe('a space’s files', () => {
  it('gathers its conversations the viewer is in, and none to anyone outside it', async () => {
    const space = (
      await noor.post('/v1/spaces', { name: 'Clinic', kind: 'team', memberIds: [omar.user.id] })
    ).space;
    const roster = await upload(noor, 'Roster.xlsx', XLSX, patientsXlsx());
    await send(noor, space.generalId, roster.id);
    const quiet = (
      await noor.post(`/v1/spaces/${space.id}/conversations`, { title: 'Owners', everyone: false })
    ).conversation.id as string;
    const deck = await upload(noor, 'Q3.pptx', PPTX, resultsPptx());
    await send(noor, quiet, deck.id);
    const mine = await noor.get(`/v1/spaces/${space.id}/files`);
    expect(mine.assets.map((a: { file: { id: string } }) => a.file.id)).toEqual([
      deck.id,
      roster.id,
    ]);
    expect(mine.assets[0]).toMatchObject({ where: 'Owners', linkable: true });
    const omars = await omar.get(`/v1/spaces/${space.id}/files`);
    expect(omars.assets.map((a: { file: { id: string } }) => a.file.id)).toEqual([roster.id]);
    expect(omars.assets[0]).toMatchObject({ senderName: 'Noor Haddad', linkable: false });
    expect((await lina.req('GET', `/v1/spaces/${space.id}/files`)).statusCode).toBe(404);
  });
});

describe('a link to one of your files', () => {
  let made: { link: { id: string; opens: number; audience: string }; url: string };
  let token: string;

  it('is made by the file’s sender alone, an adult, its token shown once', async () => {
    made = await noor.post(`/v1/files/${letter.id}/links`, { audience: 'anyone', days: 7 });
    token = pathOf(made.url).split('/f/')[1] ?? '';
    expect(made.url).toMatch(/^https:\/\/caime\.example\/f\/f_[A-Za-z0-9_-]{43}$/);
    expect(made.link).toMatchObject({ audience: 'anyone', opens: 0 });
    const kept = await t.ctx.db
      .selectFrom('file_links')
      .select(['token_hash', 'expires_at', 'message_id'])
      .where('id', '=', made.link.id)
      .executeTakeFirstOrThrow();
    expect(kept.token_hash.toString('utf8')).not.toContain(token);
    expect(kept.message_id).toBe(letterMessage);
    expect(kept.expires_at.getTime() - t.ctx.now().getTime()).toBe(7 * DAY);
    // Someone else's file, even one they can read, isn't theirs to give out.
    expect((await omar.req('POST', `/v1/files/${letter.id}/links`, {})).statusCode).toBe(404);
    expect((await lina.req('POST', `/v1/files/${letter.id}/links`, {})).statusCode).toBe(404);
    expect((await noor.req('POST', `/v1/files/${letter.id}/links`, { days: 365 })).statusCode).toBe(
      400,
    );
    // Under 18, nobody gives out links to their files (R29).
    const kid = await signup(t, { displayName: 'Young One', birthDate: '2011-06-01' });
    const drawing = await upload(kid, 'drawing.txt', 'text/plain', Buffer.from('a cat'));
    const refused = await kid.req('POST', `/v1/files/${drawing.id}/links`, {});
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe('Only adults give out links to their files.');
    expect((await noor.get(`/v1/files/${letter.id}/links`)).links).toHaveLength(1);
  });

  it('opens a page for whoever has it, the file’s words on it, counted and never indexed', async () => {
    const page = await visit(`/f/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.headers['x-robots-tag']).toBe('noindex');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.body).not.toContain('entry-abc.js');
    expect(page.body).toContain('Before your visit.docx');
    expect(page.body).toContain('Shared by Noor Haddad');
    expect(page.body).toContain('<h2 dir="auto">Allergies</h2>');
    expect(page.body).toContain(`/v1/public/files/${token}?download=1`);
    expect(page.body).toContain('name="kind" value="file"');
    // Even signed in, it's the page, never the app.
    const signedIn = await visit(`/f/${token}`, { cookie: `caime_session=${omar.token}` });
    expect(signedIn.body).not.toContain('entry-abc.js');
    const file = await anon(`/v1/public/files/${token}?download=1`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect((await noor.get(`/v1/files/${letter.id}/links`)).links[0].opens).toBe(2);
    const robots = await t.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.body).toContain('Disallow: /f/');
  });

  it('for people on Caime, asks a visitor to sign in and opens for someone who is', async () => {
    const own = await noor.post(`/v1/files/${letter.id}/links`, { audience: 'caime', days: 1 });
    const theirs = pathOf(own.url).split('/f/')[1] ?? '';
    const visitor = await visit(`/f/${theirs}`);
    expect(visitor.statusCode).toBe(200);
    expect(visitor.body).toContain('Sign in to open this file');
    expect(visitor.body).not.toContain('Before your visit.docx');
    expect((await anon(`/v1/public/files/${theirs}`)).statusCode).toBe(404);
    expect((await lina.req('GET', `/v1/public/files/${theirs}`)).statusCode).toBe(200);
    // Someone who blocked its maker reads it as a link that isn't open.
    await lina.post('/v1/blocks', { userId: noor.user.id });
    expect((await lina.req('GET', `/v1/public/files/${theirs}`)).statusCode).toBe(404);
    await lina.del(`/v1/blocks/${noor.user.id}`);
    await noor.del(`/v1/file-links/${own.link.id}`);
  });

  it('takes a report from a visitor, naming its message and maker, never its token', async () => {
    const sent = await t.app.inject({
      method: 'POST',
      url: '/v1/public/report',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        kind: 'file',
        token,
        reason: 'inappropriate',
        details: 'This file is not theirs to share.',
        name: 'A Visitor',
        email: 'visitor@example.com',
        statement: 'on',
      }).toString(),
    });
    expect(sent.statusCode).toBe(303);
    expect(sent.headers.location).toBe(`/f/${token}?reported=1#report`);
    const report = await t.ctx.db
      .selectFrom('reports')
      .select(['target_user_id', 'message_id', 'conversation_id', 'page'])
      .where('visitor_email', '=', 'visitor@example.com')
      .executeTakeFirstOrThrow();
    expect(report).toEqual({
      target_user_id: noor.user.id,
      message_id: letterMessage,
      conversation_id: chat,
      page: '/f/…',
    });
  });

  it('stops when it’s taken back, runs out, or its message or maker no longer stands', async () => {
    const live = async (url: string) => (await anon(`/v1/public/files/${url}`)).statusCode;
    await noor.del(`/v1/file-links/${made.link.id}`);
    expect(await live(token)).toBe(404);
    const gone = await visit(`/f/${token}`);
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toContain('This link isn’t open');
    expect((await omar.req('DELETE', `/v1/file-links/${made.link.id}`)).statusCode).toBe(404);
    // Runs out.
    const brief = await noor.post(`/v1/files/${letter.id}/links`, { days: 1 });
    const briefToken = pathOf(brief.url).split('/f/')[1] ?? '';
    expect(await live(briefToken)).toBe(200);
    t.clock.set(new Date(t.ctx.now().getTime() + DAY + 1000).toISOString());
    expect(await live(briefToken)).toBe(404);
    t.clock.set(new Date().toISOString());
    // Its maker deleted the message for themselves.
    const hidden = await noor.post(`/v1/files/${letter.id}/links`, {});
    const hiddenToken = pathOf(hidden.url).split('/f/')[1] ?? '';
    expect(await live(hiddenToken)).toBe(200);
    await noor.del(`/v1/messages/${letterMessage}?forEveryone=false`);
    expect(await live(hiddenToken)).toBe(404);
    // A file deleted for everyone takes its links with its bytes.
    const scan = await upload(noor, 'scan.txt', 'text/plain', Buffer.from('a scan'));
    const scanMessage = await send(noor, chat, scan.id);
    const scanLink = await noor.post(`/v1/files/${scan.id}/links`, {});
    const scanToken = pathOf(scanLink.url).split('/f/')[1] ?? '';
    expect(await live(scanToken)).toBe(200);
    await noor.del(`/v1/messages/${scanMessage}`);
    expect(await live(scanToken)).toBe(404);
    // A suspended maker's links open nothing.
    const memo = await upload(noor, 'memo.txt', 'text/plain', Buffer.from('a memo'));
    await send(noor, chat, memo.id);
    const memoLink = await noor.post(`/v1/files/${memo.id}/links`, {});
    const memoToken = pathOf(memoLink.url).split('/f/')[1] ?? '';
    expect(await live(memoToken)).toBe(200);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: t.ctx.now() })
      .where('id', '=', noor.user.id)
      .execute();
    expect(await live(memoToken)).toBe(404);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: null })
      .where('id', '=', noor.user.id)
      .execute();
    expect(await live(memoToken)).toBe(200);
  });

  it('holds five open to a file, is in its maker’s export, and goes a month after it ends', async () => {
    const memo = await upload(noor, 'five.txt', 'text/plain', Buffer.from('five'));
    await send(noor, chat, memo.id);
    for (let i = 0; i < 5; i++) await noor.post(`/v1/files/${memo.id}/links`, {});
    const sixth = await noor.req('POST', `/v1/files/${memo.id}/links`, {});
    expect(sixth.statusCode).toBe(400);
    expect(sixth.json().error.message).toBe('5 links are open: take one back first.');
    const exported = await noor.get('/v1/me/export');
    const links = exported.fileLinks as Array<Record<string, unknown>>;
    expect(links.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(links)).not.toMatch(/f_[A-Za-z0-9_-]{43}/);
    expect(links[0]).toMatchObject({ file: 'five.txt', audience: 'anyone', takenBackAt: null });
    const before = await t.ctx.db.selectFrom('file_links').select('id').execute();
    t.clock.set(new Date(Date.now() + (KEPT_DAYS.spentInvites + 31) * DAY).toISOString());
    await sweepRecords(t.ctx);
    const after = await t.ctx.db.selectFrom('file_links').select('id').execute();
    expect(after.length).toBeLessThan(before.length);
    expect(after).toEqual([]);
    t.clock.set(new Date().toISOString());
  });
});
