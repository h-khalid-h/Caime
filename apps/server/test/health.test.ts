import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('health', () => {
  it('says the process is up, and ready once the database answers', async () => {
    const up = await t.app.inject({ url: '/v1/healthz' });
    expect(up.statusCode).toBe(200);
    expect(up.json()).toEqual({ ok: true });
    const ready = await t.app.inject({ url: '/v1/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ ok: true });
    // Asked at the root by mistake, the answer says where it is.
    const root = await t.app.inject({ url: '/healthz' });
    expect(root.statusCode).toBe(404);
    expect(root.json().error.message).toContain('/v1/healthz');
  });
});
