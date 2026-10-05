/**
 * An item's photo (R63): an image the person saving uploaded, served to whoever may see the
 * item (anyone for a public one, its page's Open Graph image), and to nobody else.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itemPhotoPath, uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns the clinic
let lina: Client; // a customer
let orgId: string;
let dir: string;

async function uploadImage(c: Client, name: string) {
  const data = await sharp({
    create: { width: 320, height: 320, channels: 3, background: '#7a3ff2' },
  })
    .jpeg()
    .toBuffer();
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    data,
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

const item = (patch: Record<string, unknown>) => ({
  id: 'x',
  name: 'X',
  price: { value: 90, currency: 'EGP' },
  unit: 'each',
  minutes: null,
  capacity: 1,
  maxQuantity: 5,
  audience: 'public',
  providers: null,
  askTopic: false,
  ...patch,
});

beforeAll(async () => {
  // A web bundle to serve pages from, as the public pages' test has.
  dir = mkdtempSync(join(tmpdir(), 'caime-photos-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('an item’s photo (R63)', () => {
  it('is an image its saver uploaded; a photo already there stays, whoever set it', async () => {
    const theirs = await uploadImage(lina, 'lina.jpg');
    const bad = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: null,
      ordering: { fulfilment: ['pickup'], note: null },
      items: [item({ id: 'brush', name: 'Soft toothbrush', photoFileId: theirs.id })],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toBe('Choose an image you uploaded.');
    const mine = await uploadImage(noor, 'brush.jpg');
    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: null,
      ordering: { fulfilment: ['pickup'], note: null },
      items: [
        item({ id: 'brush', name: 'Soft toothbrush', photoFileId: mine.id }),
        item({ id: 'floss', name: 'Staff floss', audience: 'connections', photoFileId: mine.id }),
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().items[0].photoFileId).toBe(mine.id);
  });

  it('is served to anyone for a public item, and only to its audience otherwise', async () => {
    const path = (id: string) =>
      itemPhotoPath(
        { kind: 'org', id: orgId },
        { id, photoFileId: '00000000-0000-0000-0000-000000000000' },
      ) ?? '';
    const visitor = (url: string) => t.app.inject({ method: 'GET', url });
    const open = await visitor(path('brush'));
    expect(open.statusCode).toBe(200);
    expect(open.headers['content-type']).toMatch(/^image\//);
    // Customers only: no photo for a visitor, the photo for a signed-in customer.
    expect((await visitor(path('floss'))).statusCode).toBe(404);
    expect((await lina.req('GET', path('floss'))).statusCode).toBe(200);
    expect((await visitor(path('nothing'))).statusCode).toBe(404);
  });

  it('is the item page’s image, for a link’s preview and an answer engine', async () => {
    const page = await t.app.inject({
      method: 'GET',
      url: '/o/nile.dental/soft-toothbrush',
      headers: { accept: 'text/html' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(`/v1/orgs/${orgId}/items/brush/photo?v=`);
    expect(page.body).toContain(
      `"image":"https://caime.example/v1/orgs/${orgId}/items/brush/photo?v=`,
    );
    expect(page.body).toMatch(
      /<meta property="og:image" content="https:\/\/caime\.example\/v1\/orgs\/[^"]+\/items\/brush\/photo/,
    );
  });
});
