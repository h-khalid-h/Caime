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
.urgent{color:var(--danger)}
blockquote.reported{border-inline-start-color:var(--danger)}
.then{margin-top:10px}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.empty{opacity:.7;padding:24px 0}
#note{min-height:1.4em;font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>Reports</h1>
<p class="meta">What people reported, newest first, a child's safety before the rest. The operator's token stays in this tab, and every action here is in the audit log.</p>
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
<h1>Appeals</h1>
<p class="meta">Suspended accounts that say it's wrong (M16 B6). Lifting ends the suspension; upholding keeps it. Either way they're mailed, with your note.</p>
<div class="row">
<select id="appeal-status">
<option value="1">Waiting</option>
<option value="0">All</option>
</select>
<button id="load-appeals">Load appeals</button>
</div>
<div id="appeals"></div>
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
    // A visitor's report from a page (M16 B6) names who wrote and where, when they said.
    const by = r.reporter
      ? '@' + esc(r.reporter.handle)
      : r.visitor
        ? 'a visitor' + (r.visitor.name || r.visitor.email ? ' (' + esc([r.visitor.name, r.visitor.email].filter(Boolean).join(', ')) + ')' : '') + ' on <a href="' + esc(r.visitor.page) + '">' + esc(r.visitor.page) + '</a>'
        : 'someone gone';
    let what = '';
    // What the reporter saw when they reported it, kept whatever was deleted since (M16 B3).
    if (r.evidence && r.evidence.length) {
      what += '<div class="meta then">As they saw it when they reported it</div>';
      for (const e of r.evidence)
        what += '<blockquote' + (e.reported ? ' class="reported"' : '') + '><div class="meta">' + esc(e.senderName || 'Someone') + ' · ' + esc(when(e.sentAt)) + (e.reported ? ' · reported' : '') + (e.imported ? ' · imported from another app' : '') + '</div>' + (e.body ? esc(e.body) : '<em>A ' + esc(e.kind) + ' with no words.</em>') + '</blockquote>';
    }
    if (r.message) what += '<div class="meta then">The message now</div><blockquote>' + (r.message.removed ? '<em>Removed.</em>' : r.message.sealed ? '<em>A private message: sealed, not readable here.</em>' : r.message.body ? esc(r.message.body) : '<em>A ' + esc(r.message.kind) + ' with no words.</em>') + '</blockquote>';
    if (r.update) what += '<div class="meta then">The update now</div><blockquote>' + (r.update.removed ? '<em>Taken back.</em>' : esc(r.update.body)) + '</blockquote>';
    const reason = r.reason === 'child_safety' ? '<strong class="urgent">A child’s safety</strong>' : '<strong>' + esc(r.reason) + '</strong>';
    el.innerHTML =
      '<div><span class="status">' + esc(r.status) + '</span> ' + reason + ' · about ' + who + '</div>' +
      '<div class="meta">Reported by ' + by + ' · ' + esc(when(r.createdAt)) + (r.closedAt ? ' · closed ' + esc(when(r.closedAt)) : '') + (r.message ? ' · message in conversation ' + esc(r.message.conversationId) : '') + '</div>' +
      (r.details ? '<p>' + esc(r.details) + '</p>' : '') + what +
      '<div class="actions">' +
      '<button class="quiet" data-act="reviewing">Reviewing</button>' +
      '<button class="quiet" data-act="dismissed">Dismiss</button>' +
      '<button class="quiet" data-act="actioned">Actioned</button>' +
      (r.message && !r.message.removed ? '<button class="danger" data-act="remove-message">Remove the message for everyone</button>' : '') +
      (r.update && !r.update.removed ? '<button class="danger" data-act="remove-update">Take the update back</button>' : '') +
      (r.person && !r.person.suspended ? '<button class="danger" data-act="suspend">Suspend @' + esc(r.person.handle) + '</button>' : r.person ? '<span class="meta">Suspended.</span>' : '') +
      (r.org && !r.org.suspended ? '<button class="danger" data-act="suspend-org">Suspend ' + esc(r.org.name) + '</button>' : r.org ? '<span class="meta">Organization suspended.</span>' : '') +
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
    // A suspension says why, in words they'll read (M16 B6): blank gives what the report was for.
    let why;
    if (act === 'suspend' || act === 'suspend-org') {
      why = prompt(act === 'suspend'
        ? 'Every session, token and app of theirs ends now, and they can’t sign in until you lift it. Why, in words they’ll read? (Blank: what the report was for.)'
        : 'Nobody writes as it or to it, its page answers as nobody’s and its apps’ tokens stop, until you lift it. Why, in words they’ll read? (Blank: what the report was for.)', '');
      if (why === null) return;
    }
    if ((act === 'remove-message' || act === 'remove-update') && !confirm('For everyone, at once, and for good. Go ahead?')) return;
    b.disabled = true;
    try {
      const { report } = act === 'suspend' || act === 'suspend-org'
        ? await call('POST', '/admin/reports/' + id + '/' + act, why && why.trim() ? { reason: why.trim() } : {})
        : act === 'remove-message' || act === 'remove-update'
          ? await call('POST', '/admin/reports/' + id + '/' + act)
          : await call('PATCH', '/admin/reports/' + id, { status: act });
      b.closest('.card').replaceWith(card(report));
      note.textContent = 'Done.';
    } catch (e) {
      note.textContent = e.message;
      b.disabled = false;
    }
  });
  const appeals = $('appeals'), appealStatus = $('appeal-status');
  function appealCard(a) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = a.id;
    el.innerHTML =
      '<div><span class="status">' + esc(a.outcome || 'waiting') + '</span> <strong>@' + esc(a.person.handle) + '</strong> (' + esc(a.person.displayName) + ')' + (a.person.suspended ? '' : ' · <span class="meta">not suspended now</span>') + '</div>' +
      '<div class="meta">Appealed ' + esc(when(a.createdAt)) + (a.decidedAt ? ' · decided ' + esc(when(a.decidedAt)) : '') + '</div>' +
      '<div class="meta then">The reason they were shown</div><blockquote>' + (a.reason ? esc(a.reason) : '<em>None recorded.</em>') + '</blockquote>' +
      '<div class="meta then">What they say</div><blockquote>' + esc(a.body) + '</blockquote>' +
      (a.note ? '<div class="meta then">Your note</div><blockquote>' + esc(a.note) + '</blockquote>' : '') +
      (a.decidedAt ? '' : '<div class="actions"><button class="quiet" data-decide="lift">Lift the suspension</button><button class="danger" data-decide="uphold">Uphold it</button></div>');
    return el;
  }
  async function loadAppeals() {
    note.textContent = 'Loading…';
    try {
      const { appeals: rows } = await call('GET', '/admin/appeals?waiting=' + appealStatus.value + '&limit=100');
      appeals.replaceChildren(...rows.map(appealCard));
      note.textContent = rows.length ? rows.length + ' appeal' + (rows.length === 1 ? '' : 's') : '';
      if (!rows.length) appeals.innerHTML = '<p class="empty">No appeals.</p>';
    } catch (e) {
      note.textContent = e.message;
    }
  }
  appeals.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-decide]');
    if (!b) return;
    const id = b.closest('.card').dataset.id;
    const decision = b.dataset.decide;
    const text = prompt(decision === 'lift' ? 'They can sign in again at once. A note for them (optional):' : 'The suspension stands. A note for them (optional, they’ll read it):', '');
    if (text === null) return;
    b.disabled = true;
    try {
      const { appeal } = await call('POST', '/admin/appeals/' + id, text.trim() ? { decision, note: text.trim() } : { decision });
      b.closest('.card').replaceWith(appealCard(appeal));
      note.textContent = 'Done.';
    } catch (e) {
      note.textContent = e.message;
      b.disabled = false;
    }
  });
  $('load-appeals').addEventListener('click', loadAppeals);
  $('load').addEventListener('click', load);
  token.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  if (token.value) load();
})();`;
