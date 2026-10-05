import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT } from './helpers';

/**
 * What opening Caime costs a device (docs/RESOURCES.md, "People's devices"): the requests and
 * bytes of a cold launch of Chats (the root) and of a warm one (the worker and the query cache in place).
 * A measurement, not a check: it runs only with LAUNCH_COST=1 and prints what it saw.
 */
test.describe('what a launch costs', () => {
  test.skip(!process.env.LAUNCH_COST, 'a measurement: LAUNCH_COST=1 runs it');

  test('requests and bytes on a cold and a warm launch of Chats', async ({ browser }) => {
    const stamp = Date.now().toString(36);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const other = await browser.newContext();
    const me = await apiSignUp(context, 'Noor Haddad', `noor.${stamp}`);
    const them = await apiSignUp(other, 'Alex Chen', `alex.${stamp}`);
    // A connection and a short conversation, so Chats has something to load.
    const req = await other.request.post('/v1/connections/requests', {
      headers: CLIENT,
      data: { toUserId: me.id },
    });
    const { requestId } = (await req.json()) as { requestId: string };
    await context.request.post(`/v1/connections/requests/${requestId}/accept`, {
      headers: CLIENT,
      data: {},
    });
    const inbox = await context.request.get('/v1/inbox', { headers: CLIENT });
    const convo = (
      (await inbox.json()) as { sections: Array<{ items: Array<{ id: string }> }> }
    ).sections.flatMap((s) => s.items)[0]?.id;
    expect(convo, 'a conversation with Alex').toBeTruthy();
    for (const body of ['Hi Noor', 'Lunch on Friday?', 'The deck is attached']) {
      const sent = await other.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: crypto.randomUUID(), body },
      });
      expect(sent.ok()).toBe(true);
    }
    void them;

    const measure = async (label: string) => {
      const page = await context.newPage();
      const started = Date.now();
      const counts = new Map<string, number>();
      let bytes = 0;
      let sockets = 0;
      const route = (url: string) => {
        const u = new URL(url);
        return (u.pathname + u.search)
          .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')
          .replace(/-[0-9a-f]{32}\.js/, '-<hash>.js')
          .replace(/^\/_expo\/static\/js\/web\//, 'js/');
      };
      const when = new Map<string, number[]>();
      page.on('request', (r) => {
        const key = `${r.method()} ${route(r.url())}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (key.includes(' /v1/')) when.set(key, [...(when.get(key) ?? []), Date.now() - started]);
      });
      page.on('response', async (r) => {
        const len = Number(r.headers()['content-length']);
        if (Number.isFinite(len)) bytes += len;
        else if (!r.url().startsWith('data:'))
          bytes += await r
            .body()
            .then((b) => b.length)
            .catch(() => 0);
      });
      page.on('websocket', () => sockets++);
      await page.goto('/chats');
      await expect(page.getByText('The deck is attached')).toBeVisible();
      const shown = Date.now() - started;
      // Whatever the screen fetches once it's up.
      await page.waitForTimeout(3000);
      const api = [...counts].filter(([k]) => k.includes(' /v1/'));
      const assets = [...counts].filter(([k]) => !k.includes(' /v1/'));
      console.log(
        [
          `launch (${label}): first message visible at ${shown} ms; ${api.reduce((n, [, c]) => n + c, 0)} API requests, ${assets.reduce((n, [, c]) => n + c, 0)} other, ${sockets} socket(s), ${(bytes / 1024).toFixed(0)} KB received`,
          ...api
            .sort()
            .map(
              ([k, c]) =>
                `  ${String(c).padStart(3)}  ${k}  at ${(when.get(k) ?? []).join(', ')} ms`,
            ),
          ...assets
            .sort()
            .filter(([k]) => !k.includes('.woff2') && !k.includes('.png'))
            .map(([k, c]) => `  ${String(c).padStart(3)}  ${k}`),
        ].join('\n'),
      );
      await page.close();
    };
    await measure('cold');
    await measure('warm');
    await context.close();
    await other.close();
  });
});
