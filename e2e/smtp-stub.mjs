/**
 * A mail server stand-in for end-to-end runs: the server is pointed at it (SMTP_URL) and sends
 * the code that confirms an address and the link that resets a password as it would in
 * production. It keeps every message and lists them at `GET /mails?to=<address>` (newest last,
 * each with `to`, `subject` and the plain `text`), for a test to read the code or the link.
 */
import { createServer } from 'node:http';
import { SMTPServer } from 'smtp-server';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 8825);
const PORT = Number(process.env.PORT ?? 8795);
const mails = [];

const headerIn = (head, name) => {
  const m = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(head);
  return m ? m[1].trim() : '';
};

/** A body as its part says it travelled: quoted-printable or base64 undone, 7-bit as it is. */
function decode(body, encoding) {
  if (/quoted-printable/i.test(encoding))
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (/base64/i.test(encoding))
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return body;
}

/** The plain text of an entity (headers, then body), parts within parts read as a client does. */
function plainOf(folded, body) {
  // A header folded onto the next line (`boundary=` after `multipart/mixed;`) read as one.
  const head = folded.replace(/\r?\n[ \t]+/g, ' ');
  const type = headerIn(head, 'Content-Type');
  const boundary = /^multipart\//i.test(type) ? /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1] : null;
  if (!boundary) {
    if (type && !/^text\/plain/i.test(type)) return null;
    return decode(body, headerIn(head, 'Content-Transfer-Encoding'));
  }
  for (const part of body.split(`--${boundary}`).slice(1)) {
    if (part.startsWith('--')) break;
    const [partHead, ...partBody] = part.replace(/^\r?\n/, '').split(/\r?\n\r?\n/);
    const text = plainOf(partHead, partBody.join('\n\n'));
    if (text !== null) return text;
  }
  return null;
}

function parse(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const header = (name) => headerIn(head.replace(/\r?\n[ \t]+/g, ' '), name);
  // A message in parts (a meeting's invitation is its text and its calendar, alternatives within
  // a mixed message): the plain text, as a mail client shows it.
  const text = plainOf(head, rest.join('\n\n')) ?? '';
  return { to: header('To'), subject: header('Subject'), text: text.trim() };
}

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, _session, done) {
    let raw = '';
    stream.on('data', (chunk) => {
      raw += chunk.toString('utf8');
    });
    stream.on('end', () => {
      mails.push(parse(raw));
      done();
    });
  },
});
smtp.listen(SMTP_PORT, '127.0.0.1');

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') return res.end('ok');
  if (req.method === 'GET' && url.pathname === '/mails') {
    const to = url.searchParams.get('to')?.toLowerCase();
    const list = to ? mails.filter((m) => m.to.toLowerCase().includes(to)) : mails;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(list));
  }
  res.statusCode = 404;
  res.end();
}).listen(PORT, '127.0.0.1');
