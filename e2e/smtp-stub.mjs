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

function parse(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const header = (name) => headerIn(head, name);
  let text = rest.join('\n\n');
  // A message in parts (a meeting's invitation is its text and its calendar): the plain text,
  // as a mail client shows it.
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1];
  const plain = boundary
    ? text.split(`--${boundary}`).find((part) => /Content-Type:\s*text\/plain/i.test(part))
    : null;
  if (plain) {
    const [partHead, ...partBody] = plain.replace(/^\r?\n/, '').split(/\r?\n\r?\n/);
    text = decode(partBody.join('\n\n'), headerIn(partHead, 'Content-Transfer-Encoding'));
  } else text = decode(text, header('Content-Transfer-Encoding'));
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
