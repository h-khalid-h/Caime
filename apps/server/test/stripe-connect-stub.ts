/**
 * A stand-in for what an organization's own checkout (R65) asks of Stripe: Connect's OAuth
 * (token, deauthorize), a connected account, and Checkout Sessions made on that account (the
 * `Stripe-Account` header). It records every request, so a test can see what was asked and as
 * whom.
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export const STUB_KEY = 'sk_test_stub_0123456789abcdef';

export interface ConnectStub {
  url: string;
  requests: Array<{
    method: string;
    path: string;
    params: URLSearchParams;
    headers: IncomingMessage['headers'];
  }>;
  /** Accounts by id, and whether each takes payments yet. */
  accounts: Map<string, { chargesEnabled: boolean }>;
  sessions: Map<
    string,
    {
      id: string;
      account: string;
      params: URLSearchParams;
      status: 'open' | 'complete' | 'expired';
      paymentStatus: 'unpaid' | 'paid';
    }
  >;
  /** A code Stripe's consent page would hand back for this account. */
  codeFor(account: string): string;
  /** The payer paid on Stripe's page: the event Stripe would send to the Connect endpoint. */
  pay(sessionId: string): object;
  close(): Promise<void>;
}

export async function connectStub(): Promise<ConnectStub> {
  let n = 0;
  const requests: ConnectStub['requests'] = [];
  const accounts: ConnectStub['accounts'] = new Map();
  const sessions: ConnectStub['sessions'] = new Map();
  const codes = new Map<string, string>();
  const view = (s: ConnectStub['sessions'] extends Map<string, infer V> ? V : never) => ({
    id: s.id,
    object: 'checkout.session',
    status: s.status,
    payment_status: s.paymentStatus,
    url: s.status === 'open' ? `https://checkout.stripe.test/${s.id}` : null,
    metadata: Object.fromEntries(
      [...s.params.entries()]
        .filter(([k]) => k.startsWith('metadata['))
        .map(([k, v]) => [k.slice(9, -1), v]),
    ),
  });

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url ?? '/', 'http://stripe.test');
    const params = req.method === 'GET' ? url.searchParams : new URLSearchParams(raw);
    requests.push({ method: req.method ?? '', path: url.pathname, params, headers: req.headers });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${STUB_KEY}`)
      return send(401, { error: { type: 'invalid_request_error', message: 'Invalid API key.' } });
    const path = url.pathname;
    const as = req.headers['stripe-account'];
    if (req.method === 'POST' && path === '/oauth/token') {
      const account = codes.get(params.get('code') ?? '');
      if (!account || params.get('grant_type') !== 'authorization_code')
        return send(400, {
          error: 'invalid_grant',
          error_description: 'Authorization code expired.',
        });
      codes.delete(params.get('code') ?? '');
      return send(200, { stripe_user_id: account, livemode: false, scope: 'read_write' });
    }
    if (req.method === 'POST' && path === '/oauth/deauthorize')
      return send(200, { stripe_user_id: params.get('stripe_user_id') });
    const account = /^\/v1\/accounts\/(\w+)$/.exec(path);
    if (req.method === 'GET' && account) {
      const a = accounts.get(account[1] ?? '');
      if (!a)
        return send(404, { error: { code: 'resource_missing', message: 'No such account.' } });
      return send(200, { id: account[1], object: 'account', charges_enabled: a.chargesEnabled });
    }
    if (typeof as !== 'string' || !accounts.has(as))
      return send(403, {
        error: { type: 'invalid_request_error', message: 'No connected account.' },
      });
    if (req.method === 'POST' && path === '/v1/checkout/sessions') {
      const id = `cs_${(++n).toString().padStart(6, '0')}`;
      const s = {
        id,
        account: as,
        params,
        status: 'open' as const,
        paymentStatus: 'unpaid' as const,
      };
      sessions.set(id, s);
      return send(200, view(s));
    }
    const expire = /^\/v1\/checkout\/sessions\/(\w+)\/expire$/.exec(path);
    if (req.method === 'POST' && expire) {
      const s = sessions.get(expire[1] ?? '');
      if (!s || s.account !== as)
        return send(404, { error: { code: 'resource_missing', message: 'No such session.' } });
      // As Stripe: only an open session expires; a complete one answers an error.
      if (s.status !== 'open')
        return send(400, {
          error: { type: 'invalid_request_error', message: 'Only open sessions expire.' },
        });
      s.status = 'expired';
      return send(200, view(s));
    }
    const session = /^\/v1\/checkout\/sessions\/(\w+)$/.exec(path);
    if (req.method === 'GET' && session) {
      const s = sessions.get(session[1] ?? '');
      // Another account's session is nothing to this one.
      if (!s || s.account !== as)
        return send(404, { error: { code: 'resource_missing', message: 'No such session.' } });
      return send(200, view(s));
    }
    send(404, { error: { type: 'invalid_request_error', message: `No route ${path}` } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    accounts,
    sessions,
    codeFor(account) {
      const code = `ac_${(++n).toString().padStart(6, '0')}`;
      codes.set(code, account);
      return code;
    },
    pay(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`No session ${sessionId}`);
      s.status = 'complete';
      s.paymentStatus = 'paid';
      return {
        id: `evt_${++n}`,
        object: 'event',
        type: 'checkout.session.completed',
        account: s.account,
        // What the event claims is never read beyond the card it names.
        data: { object: { ...view(s), payment_status: 'paid' } },
      };
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
