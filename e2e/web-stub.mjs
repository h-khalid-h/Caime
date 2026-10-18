/**
 * A site on the web for end-to-end runs (M16 E4c): a page that says what it is in its Open Graph
 * tags and its picture, for the link previews Caime's server reads. Every request is listed at
 * `GET /requests` with the browser it came from (its user agent), so a test can tell the server
 * asked the site, once, and the reader's browser never did.
 */
import { createServer } from 'node:http';
import sharp from 'sharp';

const PORT = Number(process.env.PORT ?? 8792);
const requests = [];
const picture = await sharp({
  create: { width: 1200, height: 630, channels: 3, background: { r: 214, g: 96, b: 52 } },
})
  .png()
  .toBuffer();
const menu = `<!doctype html><html><head><meta charset="utf-8">
<title>Menu</title>
<meta property="og:title" content="The Corner Caf&eacute; &mdash; tonight&rsquo;s menu">
<meta property="og:description" content="Grilled fish, saffron rice and lemon cake, until eleven.">
<meta property="og:site_name" content="The Corner">
<meta property="og:image" content="/menu.png">
</head><body><h1>Tonight</h1></body></html>`;

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://stub').pathname;
  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (path === '/requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(requests));
    return;
  }
  requests.push({ path, agent: req.headers['user-agent'] ?? '' });
  if (path === '/menu') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(menu);
    return;
  }
  if (path === '/menu.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(picture);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not here');
}).listen(PORT, '127.0.0.1');
