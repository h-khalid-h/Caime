import { describe, expect, it } from 'vitest';
import { Caime, CaimeError } from './client';

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function stub(answer: (seen: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const s: Seen = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    seen.push(s);
    return answer(s);
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('the client', () => {
  it('calls each route with the token, JSON and the query, and unwraps the answer', async () => {
    const { seen, fetchImpl } = stub((s) =>
      json(
        200,
        s.url.includes('/messages/') ? { message: { id: 'm' } } : { conversation: { id: 'c' } },
      ),
    );
    const caime = new Caime({
      token: 'cai_x',
      baseUrl: 'https://caime.example/',
      fetch: fetchImpl,
    });
    expect(await caime.conversation('c 1')).toEqual({ id: 'c' });
    expect(seen[0]).toMatchObject({
      method: 'GET',
      url: 'https://caime.example/v1/conversations/c%201',
      headers: { authorization: 'Bearer cai_x', accept: 'application/json' },
      body: undefined,
    });
    expect(seen[0]!.headers['user-agent']).toMatch(/^caime-sdk\//);
    expect(seen[0]!.headers['content-type']).toBeUndefined();

    await caime.moveCard('m1', 'ready');
    expect(seen[1]).toMatchObject({
      method: 'POST',
      url: 'https://caime.example/v1/messages/m1/kit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'ready' }),
    });
  });

  it('puts paging in the query, leaving out what isn’t given, and makes up a clientId', async () => {
    const { seen, fetchImpl } = stub(() => json(200, { messages: [], message: { id: 'm' } }));
    const caime = new Caime({ token: 'cai_x', baseUrl: 'https://caime.example', fetch: fetchImpl });
    await caime.messages('c1', { after: 10, limit: 50 });
    expect(seen[0]!.url).toBe(
      'https://caime.example/v1/conversations/c1/messages?after=10&limit=50',
    );
    await caime.inbox('o1', 'customer_waiting');
    expect(seen[1]!.url).toBe('https://caime.example/v1/orgs/o1/inbox?view=customer_waiting');
    await caime.send('c1', 'Hello');
    const sent = JSON.parse(seen[2]!.body!);
    expect(sent.body).toBe('Hello');
    expect(sent.clientId).toMatch(/^[0-9a-f-]{36}$/);
    await caime.send('c1', 'Hello', { clientId: 'retry-1' });
    expect(JSON.parse(seen[3]!.body!).clientId).toBe('retry-1');
    await caime.sendCard('c1', 'prescription', { medicine: 'x' });
    expect(JSON.parse(seen[4]!.body!)).toMatchObject({
      kind: 'kit',
      payload: { kit: 'custom', key: 'prescription', fields: { medicine: 'x' } },
    });
  });

  it('throws the server’s refusal as a CaimeError, with retry-after when it says', async () => {
    const { fetchImpl } = stub((s) =>
      s.url.endsWith('/kits')
        ? json(403, { error: { code: 'token_scope', message: 'This token can’t make cards.' } })
        : s.url.includes('/updates')
          ? json(
              429,
              { error: { code: 'rate_limited', message: 'Slow down.' } },
              { 'retry-after': '30' },
            )
          : new Response('<html>bad gateway</html>', { status: 502 }),
    );
    const caime = new Caime({ token: 'cai_x', baseUrl: 'https://caime.example', fetch: fetchImpl });
    await expect(caime.kits()).rejects.toMatchObject({
      name: 'CaimeError',
      status: 403,
      code: 'token_scope',
      message: 'This token can’t make cards.',
      retryAfter: null,
    });
    await expect(caime.postUpdate('o1', 'x')).rejects.toMatchObject({
      status: 429,
      retryAfter: 30,
    });
    const err = await caime.conversation('c1').catch((e) => e as CaimeError);
    expect(err).toBeInstanceOf(CaimeError);
    expect(err).toMatchObject({ status: 502, code: 'http_502', message: 'Caime answered 502.' });
    expect(() => new Caime({ token: '' })).toThrow('A token is needed.');
  });
});
