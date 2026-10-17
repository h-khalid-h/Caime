/**
 * The parts a visitor's page is built of (R95): the top bar, a face or a logo, the verified mark,
 * fact chips, offer cards, the host's card, the action bar and the foot, with their CSS. Every
 * colour, type style, radius and height is a token (`page-style.ts`); every side is logical, so
 * a page runs right to left as it is; nothing here runs a script.
 */
import { tr } from '@caime/core/i18n';
import { FACE, px, type } from './page-style';
import { esc } from './site-pages';

/** Lucide's drawings (ISC), as the app's icons are, for the eye alone. */
const ICONS = {
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  verified:
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 2.004 0L20.7 7"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  layers:
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
} as const;
export type IconName = keyof typeof ICONS;

/** An icon for the eye alone; what it means is said in words beside it. */
export function icon(name: IconName, size = 18, cls = ''): string {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

/** Two letters for someone with no picture: the first of their first and last words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? (Array.from(w)[0] ?? '') : '');
  const two = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
  return two.toUpperCase() || '·';
}

/**
 * A face (round) or an organization's logo (rounded square), or its initials on the brand's soft
 * colour when there's no picture: never a blank where someone is.
 */
export function avatar(o: {
  name: string;
  src: string | null;
  size: number;
  shape: 'face' | 'mark';
}): string {
  const style = `width:${o.size}px;height:${o.size}px`;
  return o.src
    ? `<img class="av av-${o.shape}" src="${esc(o.src)}" alt="" width="${o.size}" height="${o.size}" style="${style}">`
    : `<span class="av av-${o.shape} av-letters" aria-hidden="true" style="${style};font-size:${Math.round(o.size * 0.38)}px">${esc(initials(o.name))}</span>`;
}

/** "Verified": the mark and the word, with what was proved for a reader who asks. */
export function verifiedMark(domain: string | null): string {
  return `<span class="verified" title="${esc(domain ? tr('{domain}, proved with a DNS record', { domain }) : tr('Verified'))}">${icon('verified', 16)}${esc(tr('Verified'))}</span>`;
}

/** Facts as chips under a title: length, price, place, what's left. */
export function chips(list: Array<{ icon: IconName; text: string } | null>): string {
  const shown = list.filter((c): c is { icon: IconName; text: string } => Boolean(c?.text));
  if (!shown.length) return '';
  return `<ul class="chips">${shown.map((c) => `<li>${icon(c.icon, 16)}<span>${esc(c.text)}</span></li>`).join('')}</ul>`;
}

/** An offer as a card: its photo or its kind's icon, its name, its line, the way in. */
export function offerCard(o: {
  href: string;
  name: string;
  line: string;
  photo: string | null;
  each: boolean;
  out?: boolean;
}): string {
  const thumb = o.photo
    ? `<img class="thumb" src="${esc(o.photo)}" alt="" width="56" height="56" loading="lazy">`
    : `<span class="thumb thumb-icon">${icon(o.each ? 'box' : 'calendar', 22)}</span>`;
  return `<li><a class="card" href="${esc(o.href)}">${thumb}<span class="card-body"><span class="card-title">${esc(o.name)}</span><span class="card-line">${esc(o.line)}</span></span>${o.out ? `<span class="pill-out">${esc(tr('Sold out'))}</span>` : ''}${icon('chevron', 18, 'chev')}</a></li>`;
}

/** A section with its label (sentence case, quiet) and what's in it. */
export function section(title: string, inner: string, titleHref?: string): string {
  if (!inner) return '';
  const head = titleHref ? `<a href="${esc(titleHref)}">${esc(title)}</a>` : esc(title);
  return `<section class="block"><h2 class="overline">${head}</h2>${inner}</section>`;
}

/** The bar at the top: the wordmark home, and a way in for whoever already has an account. */
export function topBar(signIn: string, wordmark: string): string {
  return `<header class="topbar"><a class="wordmark" href="/" aria-label="${esc(tr('Caime'))}">${wordmark}</a><a class="topbar-in" href="${esc(signIn)}">${esc(tr('Sign in'))}</a></header>`;
}

/** The way back up: the host, then the collection. */
export function crumbs(trail: Array<{ name: string; href: string }>): string {
  if (!trail.length) return '';
  return `<nav class="crumbs" aria-label="${esc(tr('You are here'))}">${trail
    .map((t) => `<a href="${esc(t.href)}">${esc(t.name)}</a>`)
    .join(icon('chevron', 14, 'chev'))}</nav>`;
}

/** The foot every visitor's page ends with: what Caime is, and the way to a page of one's own. */
export function pageFoot(promise: string, wordmark: string): string {
  return `<footer class="pagefoot"><a class="wordmark" href="/" aria-label="${esc(tr('Caime'))}">${wordmark}</a><p>${esc(promise)}</p><p><a href="/sign-up">${esc(tr('Make your own page on {site}', { site: 'Caime' }))}</a> · <a href="/privacy">${esc(tr('Privacy'))}</a> · <a href="/terms">${esc(tr('Terms'))}</a></p></footer>`;
}

/** The visitor pages' look (R95), beside the site's and the entry screens'. */
export const SHEET_STYLE = `
.pub-sheet{max-width:720px;padding:0 20px 40px;line-height:1.5}
.pub-sheet a{color:var(--link)}
.pub-sheet .ic{flex:none;vertical-align:middle}
[dir=rtl] .pub-sheet .chev{transform:scaleX(-1)}
.pub-sheet .topbar{display:flex;align-items:center;justify-content:space-between;min-height:${px.touch};padding:12px 0;margin-bottom:8px}
.pub-sheet .topbar .wordmark{display:inline-flex;align-items:center;text-decoration:none}
.pub-sheet .topbar-in{${type('label')};color:var(--text);text-decoration:none;padding:8px 14px;border-radius:${px.radius('pill')};background:var(--surface-muted)}
.pub-sheet .mark-letters{fill:var(--wordmark)}.pub-sheet .mark-heart{fill:var(--accent)}
.pub-sheet .crumbs{display:flex;align-items:center;flex-wrap:wrap;gap:4px;${type('captionStrong')};color:var(--text-tertiary);margin:4px 0 14px}
.pub-sheet .crumbs a{color:var(--text-secondary);text-decoration:none}.pub-sheet .crumbs a:hover{color:var(--ink)}
.pub-sheet .hero{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:20px;border:1px solid var(--border);border-radius:${px.radius('xl')};background:var(--surface)}
.pub-sheet .hero-center{align-items:center;text-align:center}
.pub-sheet .hero h1,.pub-sheet .item-main h1{${type('title')};font-size:30px;line-height:calc(36px * var(--line,1));color:var(--ink);margin:0}
.pub-sheet .who{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;${type('body')};color:var(--text-secondary);margin:0}
.pub-sheet .kicker{margin:0}
.pub-sheet .lead{${type('message')};font-size:17px;line-height:calc(26px * var(--line,1));color:var(--text-secondary);margin:0}
.pub-sheet .quote{${type('message')};margin:0;padding:12px 16px;border-inline-start:3px solid var(--accent);background:var(--surface-muted);border-radius:${px.radius('md')};color:var(--text)}
.pub-sheet .av{display:inline-grid;place-items:center;flex:none;object-fit:cover;background:var(--accent-soft);color:var(--ink);font-family:${FACE.heading};font-weight:800}
.pub-sheet .av-face{border-radius:50%}.pub-sheet .av-mark{border-radius:${px.radius('lg')}}
.pub-sheet .verified{display:inline-flex;align-items:center;gap:4px;${type('captionStrong')};color:var(--ink);background:var(--accent-soft);padding:3px 10px 3px 8px;border-radius:${px.radius('pill')}}
.pub-sheet .chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
.pub-sheet .chips li{display:inline-flex;align-items:center;gap:6px;margin:0;padding:6px 12px;border-radius:${px.radius('pill')};background:var(--surface-muted);${type('captionStrong')};color:var(--text)}
.pub-sheet .chips .ic{color:var(--text-secondary)}
.pub-sheet .actions{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.pub-sheet .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;min-height:${px.height('lg')};padding:0 22px;border-radius:${px.radius('pill')};${type('label')};text-decoration:none;background:var(--primary);color:var(--on-primary)}
.pub-sheet .btn.quiet{background:var(--surface-muted);color:var(--text)}
.pub-sheet .hero .btn.quiet{min-height:${px.height('md')}}
.pub-sheet .cover{display:grid;place-items:center;width:100%;aspect-ratio:16/7;border-radius:${px.radius('xl')};background:var(--accent-soft);color:var(--ink);margin-bottom:18px}
.pub-sheet .btn:focus-visible,.pub-sheet .card:focus-visible,.pub-sheet .topbar-in:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.pub-sheet .block{margin-top:28px}
.pub-sheet h2.overline{${type('overline')};color:var(--text-secondary);margin:0 0 10px}
.pub-sheet h2.overline a{color:inherit;text-decoration:none}.pub-sheet h2.overline a:hover{color:var(--ink)}
.pub-sheet .cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:10px}
.pub-sheet .cards li{margin:0}
.pub-sheet .card{display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--border);border-radius:${px.radius('lg')};background:var(--surface);color:var(--text);text-decoration:none;box-sizing:border-box;height:100%}
.pub-sheet .card:hover{border-color:var(--border-strong)}
.pub-sheet .thumb{width:56px;height:56px;flex:none;border-radius:${px.radius('md')};object-fit:cover;background:var(--surface-muted)}
.pub-sheet .thumb-icon{display:grid;place-items:center;background:var(--accent-soft);color:var(--ink)}
.pub-sheet .card-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pub-sheet .card-title{${type('bodyStrong')};color:var(--ink)}
.pub-sheet .card-line{${type('caption')};color:var(--text-secondary)}
.pub-sheet .card .chev{color:var(--text-tertiary)}
.pub-sheet .pill-out{${type('captionStrong')};color:var(--danger);background:var(--danger-soft);padding:2px 8px;border-radius:${px.radius('pill')}}
.pub-sheet .host{display:flex;align-items:center;gap:12px}
.pub-sheet .spec{margin:0;border-top:1px solid var(--border)}
.pub-sheet .spec>div{display:grid;grid-template-columns:140px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)}
.pub-sheet .spec dt{margin:0;padding-top:2px}.pub-sheet .spec dd{margin:0;${type('body')};color:var(--text)}
.pub-sheet .mono{${type('mono')};color:var(--text-tertiary)}
.pub-sheet .photo{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:${px.radius('xl')};background:var(--surface-muted);margin-bottom:18px}
.pub-sheet .item-main{display:flex;flex-direction:column;gap:14px}
.pub-sheet .actionbar{position:sticky;bottom:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:28px -20px 0;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border)}
.pub-sheet .actionbar .sum{flex:1;min-width:0;display:flex;flex-direction:column}
.pub-sheet .actionbar .sum strong{${type('headline')};color:var(--ink)}
.pub-sheet .actionbar .sum span{${type('caption')};color:var(--text-secondary)}
.pub-sheet .actionbar .btn{flex:none;min-width:132px}
.pub-sheet .how{flex-basis:100%;${type('caption')};color:var(--text-tertiary);margin:0}
.pub-sheet .knows{margin:0;padding-inline-start:20px}.pub-sheet .knows li{margin:6px 0}
.pub-sheet .pagefoot{margin-top:44px;padding-top:20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;${type('caption')};color:var(--text-tertiary)}
.pub-sheet .pagefoot p{margin:0}.pub-sheet .pagefoot a{color:var(--text-secondary)}.pub-sheet .pagefoot .wordmark{display:inline-flex;margin-bottom:4px}
.pub-sheet .gone{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:40px 0}
@media (min-width:640px){.pub-sheet .cards{grid-template-columns:1fr 1fr}.pub-sheet .hero{padding:28px}.pub-sheet .hero h1,.pub-sheet .item-main h1{font-size:36px;line-height:calc(42px * var(--line,1))}}
@media (max-width:560px){.pub-sheet .spec>div{grid-template-columns:1fr;gap:2px}.pub-sheet .hero .actions .btn{flex:1 1 100%}}
@media (min-width:${px.desktop}){
.pub-sheet.pub-item{max-width:1040px}
.pub-sheet .item-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:40px;align-items:start}
.pub-sheet .actionbar{position:sticky;top:24px;bottom:auto;flex-direction:column;align-items:stretch;margin:0;padding:20px;border:1px solid var(--border);border-radius:${px.radius('xl')}}
.pub-sheet .actionbar .btn{width:100%}
.pub-sheet .how{margin-top:8px}
}
[dir=rtl] .pub-sheet .hero h1,[dir=rtl] .pub-sheet .item-main h1{letter-spacing:0}
.pub-sheet .book{display:flex;flex-direction:column;gap:14px;padding:20px;border:1px solid var(--border);border-radius:${px.radius('lg')};background:var(--surface)}
.pub-sheet .book h2{${type('headline')};color:var(--ink);margin:0}
.pub-sheet .book .form{display:flex;flex-direction:column;gap:16px}
.pub-sheet .book .day{border:0;padding:0;margin:0;min-width:0}
.pub-sheet .book legend{${type('captionStrong')};color:var(--text-secondary);padding:0;margin-bottom:8px}
.pub-sheet .book .times{display:flex;flex-wrap:wrap;gap:8px}
.pub-sheet .book .time{position:relative;display:inline-flex}
.pub-sheet .book .time input{position:absolute;inset:0;margin:0;opacity:0}
.pub-sheet .book .time span{display:inline-flex;align-items:center;min-height:${px.height('md')};padding:0 14px;border:1px solid var(--border);border-radius:${px.radius('pill')};${type('label')};color:var(--text);background:var(--surface-muted)}
.pub-sheet .book .time input:checked+span{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
.pub-sheet .book .time input:focus-visible+span{outline:2px solid var(--primary);outline-offset:2px}
.pub-sheet .book .pager{display:flex;gap:16px;margin:0;${type('label')}}
.pub-sheet .book .fields{display:flex;flex-direction:column;gap:12px}
.pub-sheet .book .field{display:flex;flex-direction:column;gap:6px;${type('captionStrong')};color:var(--text-secondary)}
.pub-sheet .book .field input{box-sizing:border-box;width:100%;height:${px.height('field')};border:1px solid var(--border);border-radius:${px.radius('md')};background:var(--surface);padding:0 14px;${type('message')};color:var(--text)}
.pub-sheet .book .check{display:flex;align-items:center;gap:10px;${type('message')};color:var(--text)}
.pub-sheet .book .check input{width:20px;height:20px;margin:0;accent-color:var(--primary)}
.pub-sheet .book button.btn{border:0;cursor:pointer;align-self:flex-start}
.pub-sheet .notice{margin:0;padding:12px 14px;border-radius:${px.radius('md')};background:var(--surface-muted);${type('message')};color:var(--text)}
.pub-sheet .notice a{color:var(--primary)}
.pub-sheet .notice.ok{border:1px solid var(--border)}
`;
