import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, registerJob, runDueJobs } from '../src/lib/jobs';
import { Counter, Histogram } from '../src/lib/metrics';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const TOKEN = 'metrics-token-for-the-metrics-test-0123456789';

let t: TestApp;
let noor: Client;
let sam: Client;
let convo: string;

const scrape = async (token = TOKEN) =>
  t.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${token}` } });

beforeAll(async () => {
  t = await createTestApp({ METRICS_TOKEN: TOKEN });
  noor = await signup(t, { displayName: 'Noor Haddad', email: 'noor.metrics@example.com' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
  convo = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});

afterAll(async () => {
  await t.close();
});

describe('/metrics (PRD §81)', () => {
  it('doesn’t exist without its token, and takes only that token', async () => {
    const saved = t.ctx.config.METRICS_TOKEN;
    t.ctx.config.METRICS_TOKEN = undefined;
    const absent = await scrape();
    t.ctx.config.METRICS_TOKEN = saved;
    expect(absent.statusCode).toBe(404);
    expect(absent.json().error.code).toBe('not_found');
    expect((await scrape('not-it')).statusCode).toBe(401);
    const noHeader = await t.app.inject({ method: 'GET', url: '/metrics' });
    expect(noHeader.statusCode).toBe(401);
    const ok = await scrape();
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
  });

  it('counts by the route as declared, never the path or anything said', async () => {
    await noor.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'The secret word is marmalade',
    });
    await sam.get(`/v1/conversations/${convo}/messages`);
    const body = (await scrape()).body;
    expect(body).toContain(
      'caime_http_requests_total{method="GET",route="/v1/conversations/:id/messages",status="200"} 1',
    );
    expect(body).toContain(
      'caime_http_request_duration_seconds_count{method="GET",route="/v1/conversations/:id/messages"} 1',
    );
    expect(body).toContain('caime_messages_total{kind="text"} 1');
    expect(body).toMatch(/^caime_db_pool_connections\{state="total"\} \d+$/m);
    expect(body).toMatch(/^process_uptime_seconds \d+$/m);
    expect(body).toMatch(/^caime_jobs_queued \d+$/m);
    expect(body).toMatch(/^caime_jobs_oldest_seconds \d+$/m);
    // Nothing anyone said, and nothing that identifies anyone or anything.
    for (const secret of [
      'marmalade',
      convo,
      noor.user.id,
      sam.user.id,
      noor.user.handle,
      'noor.metrics@example.com',
    ])
      expect(body).not.toContain(secret);
  });

  it('counts jobs by kind and outcome', async () => {
    registerJob('test_metrics_ok', async () => {});
    registerJob('test_metrics_fail', async () => {
      throw new Error('no');
    });
    await enqueue(t.ctx, 'test_metrics_ok', {});
    await enqueue(t.ctx, 'test_metrics_fail', {});
    await runDueJobs(t.ctx);
    const body = (await scrape()).body;
    expect(body).toContain('caime_jobs_total{kind="test_metrics_ok",outcome="done"} 1');
    expect(body).toContain('caime_jobs_total{kind="test_metrics_fail",outcome="failed"} 1');
    expect(body).toContain('caime_job_duration_seconds_count{kind="test_metrics_ok"} 1');
  });

  it('writes Prometheus text: escaped labels, cumulative buckets', () => {
    const c = new Counter('x_total', 'X.');
    c.inc({ why: 'a "quoted"\nline \\ here' });
    expect(c.render()).toBe(
      '# HELP x_total X.\n# TYPE x_total counter\nx_total{why="a \\"quoted\\"\\nline \\\\ here"} 1\n',
    );
    const h = new Histogram('y_seconds', 'Y.', [0.005, 0.25, 5]);
    for (const v of [0.003, 0.2, 3]) h.observe({ route: '/a' }, v);
    expect(h.render().split('\n').slice(2, 8)).toEqual([
      'y_seconds_bucket{le="0.005",route="/a"} 1',
      'y_seconds_bucket{le="0.25",route="/a"} 2',
      'y_seconds_bucket{le="5",route="/a"} 3',
      'y_seconds_bucket{le="+Inf",route="/a"} 3',
      'y_seconds_sum{route="/a"} 3.203',
      'y_seconds_count{route="/a"} 3',
    ]);
  });
});
