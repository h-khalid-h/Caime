/**
 * Options on an item (R60): a size to choose, extras to add. Saved with the catalog, chosen on
 * each line of an order (a line per item and set of choices), priced per piece and fixed on the
 * card; an option not chosen as it asks is refused, and the item's stock counts over its lines.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BookingItem, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { menuLines } from '../src/lib/booking';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let lina: Client;
let orgId: string;
let convo: string;

const COFFEE = {
  id: 'coffee',
  name: 'Coffee',
  price: { value: 40, currency: 'EGP' },
  unit: 'each',
  minutes: null,
  capacity: 1,
  maxQuantity: 6,
  audience: 'public',
  providers: null,
  askTopic: false,
  options: [
    {
      id: 'size',
      name: 'Size',
      pick: 'one',
      required: true,
      choices: [
        { id: 's', name: 'Small', price: null },
        { id: 'l', name: 'Large', price: 10 },
      ],
    },
    {
      id: 'extras',
      name: 'Extras',
      pick: 'any',
      required: false,
      choices: [
        { id: 'oat', name: 'Oat milk', price: 5 },
        { id: 'shot', name: 'Extra shot', price: 8 },
      ],
    },
  ],
};

const save = (items: unknown[]) =>
  noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: null,
    items,
    ordering: { fulfilment: ['pickup'], note: null },
  });
const order = (lines: unknown[]) =>
  lina.req('POST', `/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: { kit: 'order_status', fields: {}, order: { lines } },
  });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-options-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Bean Corner',
      handle: 'bean.corner',
      kind: 'shop',
    })
  ).org.id;
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('options on an item (R60)', () => {
  it('are saved with something sold by the piece, and only fit ones', async () => {
    const set = await save([COFFEE]);
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json().items[0].options).toEqual(COFFEE.options);
    // A customer reads them with the item.
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.bookingItems[0].options).toEqual(
      COFFEE.options,
    );
    const refused = async (item: unknown) => (await save([item])).statusCode;
    // Something booked in time has none; a free item adds nothing; an id is used once.
    expect(await refused({ ...COFFEE, unit: 'minutes', minutes: 30, maxQuantity: 1 })).toBe(400);
    expect(await refused({ ...COFFEE, price: null })).toBe(400);
    expect(
      await refused({
        ...COFFEE,
        options: [COFFEE.options[0], { ...COFFEE.options[1], id: 'size' }],
      }),
    ).toBe(400);
    expect(await refused({ ...COFFEE, options: [{ ...COFFEE.options[0], choices: [] }] })).toBe(
      400,
    );
  });

  it('an order chooses them per line, priced per piece and fixed on the card', async () => {
    const placed = await order([
      { itemId: 'coffee', quantity: 2, choices: ['l', 'oat'] },
      { itemId: 'coffee', quantity: 1, choices: ['s'] },
    ]);
    expect(placed.statusCode, placed.body).toBe(201);
    const card = placed.json().message.payload;
    expect(card.order.lines).toEqual([
      {
        itemId: 'coffee',
        name: 'Coffee',
        quantity: 2,
        price: { value: 110, currency: 'EGP' },
        choices: [
          { id: 'l', name: 'Large' },
          { id: 'oat', name: 'Oat milk' },
        ],
      },
      {
        itemId: 'coffee',
        name: 'Coffee',
        quantity: 1,
        price: { value: 40, currency: 'EGP' },
        choices: [{ id: 's', name: 'Small' }],
      },
    ]);
    expect(card.order.total).toEqual({ value: 150, currency: 'EGP' });
    expect(card.fields.summary).toBe('2 × Coffee (Large, Oat milk), 1 × Coffee (Small)');
    expect(card.fields.amount).toEqual({ value: 150, currency: 'EGP' });
  });

  it('refuses an option not chosen as it asks, and too many of the item over its lines', async () => {
    const noSize = await order([{ itemId: 'coffee', quantity: 1, choices: ['oat'] }]);
    expect(noSize.statusCode).toBe(400);
    expect(noSize.json().error.message).toBe('Choose from “Size” for Coffee.');
    expect((await order([{ itemId: 'coffee', quantity: 1, choices: ['s', 'l'] }])).statusCode).toBe(
      400,
    );
    expect((await order([{ itemId: 'coffee', quantity: 1, choices: ['l', 'x'] }])).statusCode).toBe(
      400,
    );
    const tooMany = await order([
      { itemId: 'coffee', quantity: 4, choices: ['s'] },
      { itemId: 'coffee', quantity: 3, choices: ['l'] },
    ]);
    expect(tooMany.statusCode).toBe(403);
  });

  it('its stock counts over every line of it', async () => {
    await save([{ ...COFFEE, stock: 3 }]);
    const over = await order([
      { itemId: 'coffee', quantity: 2, choices: ['s'] },
      { itemId: 'coffee', quantity: 2, choices: ['l'] },
    ]);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('sold_out');
    const fits = await order([
      { itemId: 'coffee', quantity: 2, choices: ['s'] },
      { itemId: 'coffee', quantity: 1, choices: ['l', 'shot'] },
    ]);
    expect(fits.statusCode, fits.body).toBe(201);
    const left = await t.ctx.db
      .selectFrom('item_stock')
      .select('remaining')
      .where('host_id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(left.remaining).toBe(0);
  });

  it('the AI agent reads them on its menu, ids and added prices', () => {
    expect(
      menuLines([
        { ...COFFEE, slug: 'coffee', description: null, collectionId: null } as BookingItem,
      ]),
    ).toBe(
      [
        'coffee · Coffee · EGP 40 · up to 6',
        '  option Size (one, required): s=Small, l=Large +10',
        '  option Extras (any): oat=Oat milk +5, shot=Extra shot +8',
      ].join('\n'),
    );
  });

  it('a visitor reads them on the item’s page', async () => {
    await save([COFFEE]);
    const page = await t.app.inject({
      method: 'GET',
      url: '/o/bean.corner/coffee',
      headers: { accept: 'text/html' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<dt class="mono">Size</dt><dd>Small, Large +EGP');
    expect(page.body).toContain('Oat milk +EGP');
  });
});
