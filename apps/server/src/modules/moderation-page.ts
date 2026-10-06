import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context';
import { FACE, shellFaces, THEME_VARS } from '../lib/page-style';
import { PERMISSIONS_POLICY } from '../lib/public-pages';
import { webCsp } from '../plugins/static';

/**
 * The operator's review of reports (R49): one page at /admin/reports, plain HTML and a script
 * of its own (the web's CSP allows no inline script), talking to /v1/admin/reports with the
 * operator's token, which the page keeps in the tab's sessionStorage and nowhere else. No
 * characters here (BRAND.md B2): it's a security surface.
 */
export async function moderationPageRoutes(app: FastifyInstance, ctx: AppContext) {
  const csp = webCsp(ctx.config.PUBLIC_URL);
  const page = PAGE.replace('<!-- faces -->', shellFaces(ctx.config.WEB_DIR));
  app.get(
    '/admin/reports',
    async (_req, reply): Promise<FastifyReply> =>
      reply
        .header('cache-control', 'no-store')
        .header('content-security-policy', csp)
        .header('permissions-policy', PERMISSIONS_POLICY)
        .header('x-robots-tag', 'noindex')
        .type('text/html; charset=utf-8')
        .send(page),
  );
  app.get(
    '/admin/reports.js',
    async (_req, reply): Promise<FastifyReply> =>
      reply.header('cache-control', 'no-store').type('text/javascript; charset=utf-8').send(SCRIPT),
  );
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Reports · Caime</title>
<!-- faces -->
<style>
:root{color-scheme:light dark}
${THEME_VARS}
body{margin:0;font-family:${FACE.body};background:var(--canvas);color:var(--text);line-height:1.45}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.4rem;margin:0 0 12px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 16px}
input,select,button{font:inherit;padding:8px 10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text)}
input{flex:1;min-width:220px}
button{cursor:pointer;background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
button.quiet{background:transparent;color:inherit;border-color:var(--border-strong)}
button.danger{background:var(--danger-soft);color:var(--danger);border-color:var(--danger-soft)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin:10px 0}
.meta{font-size:.85rem;opacity:.75}
blockquote{margin:8px 0;padding:8px 12px;border-inline-start:3px solid var(--border-strong);white-space:pre-wrap;word-break:break-word}
.status{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.8rem;background:var(--surface-muted);color:var(--ink)}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.empty{opacity:.7;padding:24px 0}
#note{min-height:1.4em;font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>Reports</h1>
<p class="meta">What people reported, newest first. The operator's token stays in this tab, and every action here is in the audit log.</p>
<div class="row">
<input id="token" type="password" placeholder="Operator token" autocomplete="off">
<select id="status">
<option value="open">Open</option>
<option value="reviewing">Reviewing</option>
<option value="actioned">Actioned</option>
<option value="dismissed">Dismissed</option>
<option value="all">All</option>
</select>
<button id="load">Load</button>
</div>
<div id="note" role="status" aria-live="polite"></div>
<div id="list"></div>
</main>
<script src="/admin/reports.js"></script>
</body>
</html>`;

const SCRIPT = `(() => {
  const KEY = 'caime.operator';
  const $ = (id) => document.getElementById(id);
  const token = $('token'), status = $('status'), list = $('list'), note = $('note');
  try { token.value = sessionStorage.getItem(KEY) || ''; } catch {}
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const when = (iso) => new Date(iso).toLocaleString();
  async function call(method, path, body) {
    const r = await fetch('/v1' + path, {
      method,
      headers: { authorization: 'Bearer ' + token.value.trim(), 'content-type': 'application/json', 'x-caime-client': 'web' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + r.status));
    return data;
  }
  function card(r) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = r.id;
    const who = r.person ? '@' + esc(r.person.handle) + ' (' + esc(r.person.displayName) + ')' : r.org ? esc(r.org.name) + ' (@' + esc(r.org.handle) + ')' : 'nobody in particular';
    const by = r.reporter ? '@' + esc(r.reporter.handle) : 'someone gone';
    let what = '';
    if (r.message) what += '<blockquote>' + (r.message.removed ? '<em>Removed.</em>' : r.message.sealed ? '<em>A private message: sealed, not readable here.</em>' : r.message.body ? esc(r.message.body) : '<em>A ' + esc(r.message.kind) + ' with no words.</em>') + '</blockquote>';
    if (r.update) what += '<blockquote>' + (r.update.removed ? '<em>Taken back.</em>' : esc(r.update.body)) + '</blockquote>';
    el.innerHTML =
      '<div><span class="status">' + esc(r.status) + '</span> <strong>' + esc(r.reason) + '</strong> · about ' + who + '</div>' +
      '<div class="meta">Reported by ' + by + ' · ' + esc(when(r.createdAt)) + (r.message ? ' · message in conversation ' + esc(r.message.conversationId) : '') + '</div>' +
      (r.details ? '<p>' + esc(r.details) + '</p>' : '') + what +
      '<div class="actions">' +
      '<button class="quiet" data-act="reviewing">Reviewing</button>' +
      '<button class="quiet" data-act="dismissed">Dismiss</button>' +
      '<button class="quiet" data-act="actioned">Actioned</button>' +
      (r.message && !r.message.removed ? '<button class="danger" data-act="remove-message">Remove the message for everyone</button>' : '') +
      (r.update && !r.update.removed ? '<button class="danger" data-act="remove-update">Take the update back</button>' : '') +
      (r.person && !r.person.suspended ? '<button class="danger" data-act="suspend">Suspend @' + esc(r.person.handle) + '</button>' : r.person ? '<span class="meta">Suspended.</span>' : '') +
      '</div>';
    return el;
  }
  async function load() {
    note.textContent = 'Loading…';
    try {
      sessionStorage.setItem(KEY, token.value.trim());
    } catch {}
    try {
      const { reports } = await call('GET', '/admin/reports?status=' + encodeURIComponent(status.value) + '&limit=100');
      list.replaceChildren(...reports.map(card));
      note.textContent = reports.length ? reports.length + ' report' + (reports.length === 1 ? '' : 's') : '';
      if (!reports.length) list.innerHTML = '<p class="empty">Nothing here.</p>';
    } catch (e) {
      note.textContent = e.message;
    }
  }
  list.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-act]');
    if (!b) return;
    const id = b.closest('.card').dataset.id;
    const act = b.dataset.act;
    if (act === 'suspend' && !confirm('Every session, token and app of theirs ends now, and they can’t sign in until you lift it. Go ahead?')) return;
    if ((act === 'remove-message' || act === 'remove-update') && !confirm('For everyone, at once, and for good. Go ahead?')) return;
    b.disabled = true;
    try {
      const { report } = act === 'remove-message' || act === 'remove-update' || act === 'suspend'
        ? await call('POST', '/admin/reports/' + id + '/' + act)
        : await call('PATCH', '/admin/reports/' + id, { status: act });
      b.closest('.card').replaceWith(card(report));
      note.textContent = 'Done.';
    } catch (e) {
      note.textContent = e.message;
      b.disabled = false;
    }
  });
  $('load').addEventListener('click', load);
  token.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  if (token.value) load();
})();`;
