import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { createTestApp, type TestApp, until } from './helpers';

/**
 * The bus's listening connection comes back after it's lost (review 2026-10-17 §4 H1): a
 * database restart or a failover ends it, the instance says it isn't ready meanwhile, and
 * once it listens again events arrive and whoever asked to know is told.
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('bus', () => {
  it('listens again after its connection is ended, and is not ready meanwhile', async () => {
    const bus = t.ctx.bus;
    const heard: BusMessage[] = [];
    const off = bus.subscribe((m) => heard.push(m));
    let reconnected = 0;
    const offReconnect = bus.onReconnect(() => {
      reconnected += 1;
    });
    expect(bus.healthy()).toBe(true);
    expect((await t.app.inject({ url: '/v1/readyz' })).statusCode).toBe(200);
    // The database ends the listening backend, as a restart would.
    const pid = await bus.backendPid();
    expect(pid).not.toBeNull();
    await sql`select pg_terminate_backend(${pid})`.execute(t.ctx.db);
    await until(() => !bus.healthy(), 5_000, 'the loss being noticed');
    expect(bus.lastError).toBeTruthy();
    expect((await t.app.inject({ url: '/v1/readyz' })).statusCode).toBe(503);
    // Back within the first retry, and every socket would be told to catch up.
    await until(() => bus.healthy(), 10_000, 'listening again');
    expect(bus.reconnects).toBe(1);
    expect(reconnected).toBe(1);
    expect(bus.lastError).toBeNull();
    expect((await t.app.inject({ url: '/v1/readyz' })).statusCode).toBe(200);
    await bus.publish(['00000000-0000-0000-0000-000000000001'], { type: 'test', data: { n: 1 } });
    await until(() => heard.length > 0, 5_000, 'an event after reconnecting');
    expect(heard[0]?.event).toEqual({ type: 'test', data: { n: 1 } });
    // Nothing of the lost connection stayed in the pool.
    expect(t.ctx.pool.totalCount).toBeLessThanOrEqual(20);
    off();
    offReconnect();
  });
});
