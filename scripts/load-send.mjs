#!/usr/bin/env node
/**
 * The write path under load (M18 J5, docs/RESOURCES.md): one person sends into a group of
 * connections who each hold a socket, through the bundled server as a phone would (a text a
 * request, a fresh client id each), and the sockets count what reached them. Run it against a
 * server started as the E2E starts it (`pnpm build`, then `apps/server/dist/server.js` with the
 * E2E's environment on a database of its own), never against production:
 *
 *   node scripts/load-send.mjs [base=http://127.0.0.1:8787] [members=20] [connections=50] [seconds=10]
 *
 * It signs the people up (each from an address of a documentation range, as the E2E does),
 * connects them, makes the group, opens a socket per member, then everyone sends on that many
 * connections at once for that long (each text its own client id; one person may send 120 a
 * minute, so the senders share the load) and prints the latencies, the rate, the status counts
 * and how many sends each socket heard.
 */
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

const [base = 'http://127.0.0.1:8787', membersArg = '20', connArg = '50', secArg = '10'] =
  process.argv.slice(2);
const MEMBERS = Number(membersArg);
const CLIENT = { 'x-caime-client': 'web', 'content-type': 'application/json' };
const run = randomBytes(3).toString('hex');
let signups = 0;

/** A person signed up and onboarded, with the cookie their requests carry. */
async function signUp(i) {
  const res = await fetch(`${base}/v1/auth/signup`, {
    method: 'POST',
    headers: { ...CLIENT, 'x-forwarded-for': `198.51.100.${(signups++ % 250) + 1}` },
    body: JSON.stringify({
      email: `ld${run}x${i}@example.com`,
      password: 'a long enough passphrase',
      displayName: `Load ${i}`,
      handle: `ld${run}x${i}`,
      birthDate: '1990-12-31',
      country: 'EG',
      timeZone: 'UTC',
      client: 'web',
    }),
  });
  if (!res.ok) throw new Error(`sign-up ${i}: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const { user } = await res.json();
  const done = await fetch(`${base}/v1/me`, {
    method: 'PATCH',
    headers: { ...CLIENT, cookie },
    body: JSON.stringify({ onboarded: true }),
  });
  if (!done.ok) throw new Error(`onboard ${i}: ${done.status}`);
  return { id: user.id, cookie };
}

async function post(person, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...CLIENT, cookie: person.cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const sender = await signUp(0);
const members = [];
for (let i = 1; i <= MEMBERS; i++) members.push(await signUp(i));
for (const m of members) {
  const { requestId } = await post(sender, '/v1/connections/requests', {
    toUserId: m.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await post(m, `/v1/connections/requests/${requestId}/accept`, {});
}
const { conversation } = await post(sender, '/v1/conversations', { kind: 'group', title: 'Load' });
await post(sender, `/v1/conversations/${conversation.id}/members`, {
  userIds: members.map((m) => m.id),
});

// A socket per member, counting the sends it hears for this group.
const heard = new Map();
await Promise.all(
  members.map(
    (m) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/v1/realtime`, {
          headers: { cookie: m.cookie, 'x-caime-client': 'web' },
        });
        heard.set(m.id, 0);
        ws.on('message', (raw) => {
          const frame = JSON.parse(String(raw));
          if (frame.type === 'hello') resolve();
          if (
            frame.type === 'event' &&
            frame.event?.type === 'message.created' &&
            JSON.stringify(frame.event).includes(conversation.id)
          )
            heard.set(m.id, heard.get(m.id) + 1);
        });
        ws.on('error', reject);
      }),
  ),
);

// One send by hand first: the route answers, or the run would only count errors.
const first = await fetch(`${base}/v1/conversations/${conversation.id}/messages`, {
  method: 'POST',
  headers: { ...CLIENT, cookie: sender.cookie },
  body: JSON.stringify({ kind: 'text', body: 'load', clientId: `warm-${run}` }),
});
if (!first.ok) throw new Error(`a send: ${first.status} ${await first.text()}`);
console.log(
  `${MEMBERS} members on sockets, ${MEMBERS + 1} senders (120 a minute each); ${connArg} connections for ${secArg} s`,
);
// The load itself: each connection sends one text after another until the time is up, a fresh
// client id each (a repeated one is answered as the same message, ADR-8, and would measure
// nothing), its latency kept.
const latencies = [];
let ok = 0;
let refused = 0;
let errors = 0;
const until = Date.now() + Number(secArg) * 1000;
const url = `${base}/v1/conversations/${conversation.id}/messages`;
// Everyone in the group sends, since one person may send 120 a minute (the send route's limit,
// right for a person): the connections take turns among them.
const senders = [sender, ...members];
async function connection(n) {
  const headers = { ...CLIENT, cookie: senders[n % senders.length].cookie };
  let i = 0;
  while (Date.now() < until) {
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind: 'text', body: 'load', clientId: `${run}-${n}-${i++}` }),
      });
      await res.arrayBuffer();
      if (res.ok) ok++;
      else refused++;
    } catch {
      errors++;
    }
    latencies.push(performance.now() - started);
  }
}
const began = Date.now();
await Promise.all([...Array(Number(connArg))].map((_, n) => connection(n)));
const seconds = (Date.now() - began) / 1000;
latencies.sort((a, b) => a - b);
const at = (q) =>
  Math.round(latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0);
const sent = ok;
console.log(
  `sends: ${ok} ok, ${refused} refused, ${errors} errors; ${Math.round(ok / seconds)} req/s`,
);
console.log(
  `latency ms: p50 ${at(0.5)}, p97.5 ${at(0.975)}, p99 ${at(0.99)}, max ${Math.round(latencies.at(-1) ?? 0)}`,
);
// The sockets' side: what each member heard of what was sent, once the last events land.
await new Promise((done) => setTimeout(done, 3000));
const counts = [...heard.values()];
console.log(
  `sockets heard: min ${Math.min(...counts)}, max ${Math.max(...counts)} of ${sent} sends each`,
);
process.exit(0);
