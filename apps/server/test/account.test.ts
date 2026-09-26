import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { uuidv4 } from '@caishy/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

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
    const res = await hassan.req('GET', '/v1/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="caishy-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const archive = res.json();
    expect(archive.format).toBe('caishy-export/1');
    expect(archive.account.id).toBe(hassan.user.id);
    expect(archive.relationships[0]).toMatchObject({
      label: 'Manager · DATA C',
      person: { displayName: 'Sarah Ahmed' },
    });
    expect(archive.messages.map((m: any) => m.body)).toEqual(['From Hassan']);
    expect(JSON.stringify(archive)).not.toContain('From Sarah');
    expect(JSON.stringify(archive)).not.toContain('password');
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
