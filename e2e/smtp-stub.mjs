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

function parse(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const header = (name) => {
    const m = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(head);
    return m ? m[1].trim() : '';
  };
  let text = rest.join('\n\n');
  // Plain 7-bit text, as the server sends; quoted-printable soft breaks undone just in case.
  if (/quoted-printable/i.test(header('Content-Transfer-Encoding')))
    text = text
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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
