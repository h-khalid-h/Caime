/**
 * The mail provider's stand-in for end-to-end runs (R75): Caime's server is pointed at it
 * (MAIL_BASE_URL) and sends replies through its API as it would through Postmark's. It keeps
 * every mail sent and lists them at `GET /sent` (newest last, as posted: From, To, Subject,
 * TextBody, Headers, with the MessageID it answered), cleared by `DELETE /sent`. Mail in is posted to Caime's own webhook by the
 * test, as the provider would.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8798);
const sent = [];

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/sent') return json(res, 200, { sent });
  if (req.method === 'DELETE' && url.pathname === '/sent') {
    sent.length = 0;
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/email') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    // An id of its own each time, as the provider gives: a run's mails never meet an earlier run's.
    const MessageID = `pm-${randomUUID()}`;
    sent.push({ ...JSON.parse(raw || '{}'), MessageID });
    return json(res, 200, { MessageID, ErrorCode: 0, Message: 'OK' });
  }
  // The provider probe's cheapest read (R78): the server, as Postmark names it.
  if (req.method === 'GET' && url.pathname === '/server')
    return json(res, 200, { ID: 1, Name: 'stub', DeliveryType: 'Live' });
  json(res, 404, { error: 'not here' });
}).listen(PORT, '127.0.0.1');
