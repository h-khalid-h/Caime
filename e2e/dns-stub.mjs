/**
 * A DNS stand-in for end-to-end runs, so an organization can verify its domain the way it would
 * in production: the server is pointed at it (DNS_SERVERS) and asks it for TXT records, which a
 * test publishes first with `POST /records {name, values}`. It answers TXT questions only, from
 * what was published, and says NXDOMAIN to everything else.
 */
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';

const DNS_PORT = Number(process.env.DNS_PORT ?? 8853);
const PORT = Number(process.env.PORT ?? 8797);
/** name (lowercase, no trailing dot) → TXT values */
const records = new Map();

function readName(buf, offset) {
  const labels = [];
  let at = offset;
  while (buf[at] !== 0) {
    const len = buf[at];
    labels.push(buf.subarray(at + 1, at + 1 + len).toString('ascii'));
    at += len + 1;
  }
  return { name: labels.join('.').toLowerCase(), end: at + 1 };
}

function answer(query) {
  const { name, end } = readName(query, 12);
  const type = query.readUInt16BE(end);
  const question = query.subarray(12, end + 4);
  const values = type === 16 ? (records.get(name) ?? []) : [];
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2); // the query's id
  // A response, recursion desired and available; NXDOMAIN when nothing is published there.
  header.writeUInt16BE(values.length ? 0x8180 : 0x8183, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(values.length, 6);
  const answers = values.map((value) => {
    const text = Buffer.from(value, 'utf8');
    const strings = [];
    for (let i = 0; i < text.length || i === 0; i += 255) {
      const part = text.subarray(i, i + 255);
      strings.push(Buffer.from([part.length]), part);
    }
    const rdata = Buffer.concat(strings);
    const fixed = Buffer.alloc(12);
    fixed.writeUInt16BE(0xc00c, 0); // the name, as a pointer to the question's
    fixed.writeUInt16BE(16, 2); // TXT
    fixed.writeUInt16BE(1, 4); // IN
    fixed.writeUInt32BE(0, 6); // never cached
    fixed.writeUInt16BE(rdata.length, 10);
    return Buffer.concat([fixed, rdata]);
  });
  return Buffer.concat([header, question, ...answers]);
}

const udp = createSocket('udp4');
udp.on('message', (msg, peer) => {
  try {
    udp.send(answer(msg), peer.port, peer.address);
  } catch {
    // A question it can't read goes unanswered, as a real server's might.
  }
});
udp.bind(DNS_PORT, '127.0.0.1');

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return res.end('ok');
  if (req.method === 'POST' && req.url === '/records') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      const { name, values } = JSON.parse(body);
      records.set(String(name).toLowerCase().replace(/\.$/, ''), values.map(String));
      res.end('ok');
    });
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(PORT, '127.0.0.1');
