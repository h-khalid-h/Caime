/**
 * A file from a connected account's drive, attached in a conversation (R90): the person picks it
 * (in Google's own picker, which grants Caime that file alone, or in Caime's browser over their
 * OneDrive), and the server copies it into Caime's storage as their own upload, so it's kept,
 * shown, searched, exported and erased as any file is. Nothing of the drive is kept: not the
 * listing, not a link, not the file's id there.
 */
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { uuidv7 } from '@caime/core';
import {
  ACCOUNT_FILE_MAX_BYTES,
  ACCOUNT_PICKED_PATH,
  type AccountProvider,
  type AccountUse,
} from '@caime/core/accounts';
import type { AccountFilesResponse, AccountFileView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { Config } from '../config';
import type { AppContext } from '../context';
import { accessFor, markAccount } from './connected-accounts';
import { AppError, badRequest } from './errors';
import { type FileRow, storeFile } from './files';
import { assertStorage } from './plans';
import type { Storage } from './storage';

type Account = Parameters<typeof accessFor>[1];

const PROVIDER_MS = 15_000;
/** How long the copy of one file may take, start to end. */
const COPY_MS = 120_000;
const PAGE = 100;

/** Google's own documents have no bytes of their own: each is copied as a PDF. */
const GOOGLE_EXPORTS: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf',
};

/** Whether Google's picker can open here: its key and the project's number are set. */
export function googlePickerOn(config: Config): boolean {
  return Boolean(config.GOOGLE_PICKER_API_KEY && config.GOOGLE_PICKER_APP_ID);
}

/** The uses each provider offers on this Caime: Google's files need its picker. */
export function usesOffered(config: Config): Record<AccountProvider, AccountUse[]> {
  return {
    google: googlePickerOn(config) ? ['calendar', 'files'] : ['calendar'],
    microsoft: ['calendar', 'files'],
  };
}

/** The connection's access for its files, or why there's none. */
export async function filesAccess(ctx: AppContext, account: Account): Promise<string> {
  if (!account.uses.includes('files'))
    throw new AppError(403, 'forbidden', tr('Turn on Files for this account first.'));
  const access = await accessFor(ctx, account);
  if (!access) throw reconnect();
  return access;
}

const reconnect = () =>
  new AppError(409, 'account_reconnect', tr('That account needs connecting again.'));
const failed = (name: string) =>
  new AppError(
    502,
    'provider_failed',
    tr('{name} didn’t answer. Try again in a moment.', { name }),
  );

async function ask(ctx: AppContext, account: Account, url: string, access: string) {
  const name = account.provider === 'google' ? 'Google' : 'Microsoft';
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${access}`, accept: 'application/json' },
      signal: AbortSignal.timeout(PROVIDER_MS),
    });
  } catch {
    throw failed(name);
  }
  if (res.status === 401) {
    await markAccount(ctx, account.id, 'reconnect');
    throw reconnect();
  }
  if (res.status === 404 || res.status === 403)
    throw new AppError(404, 'not_found', tr('{what} wasn’t found.', { what: tr('That file') }));
  if (!res.ok) throw failed(name);
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

const graph = (ctx: AppContext) => `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0`;

interface GraphItem {
  id?: string;
  name?: string;
  size?: number;
  folder?: unknown;
  file?: { mimeType?: string };
  lastModifiedDateTime?: string;
}

const itemView = (i: GraphItem): AccountFileView | null =>
  i.id && i.name && (i.folder || i.file)
    ? {
        id: i.id,
        name: i.name,
        folder: Boolean(i.folder),
        size: i.folder || typeof i.size !== 'number' ? null : i.size,
        mime: i.file?.mimeType ?? null,
        modifiedAt: i.lastModifiedDateTime ?? null,
      }
    : null;

/**
 * A OneDrive folder (the top when none), a search in it, or the next page of either, read with
 * the person's access and kept nowhere. The next page's key is Microsoft's own link, followed
 * only when it is Graph's.
 */
export async function listAccountFiles(
  ctx: AppContext,
  account: Account,
  query: { folder?: string; q?: string; next?: string },
): Promise<AccountFilesResponse> {
  if (account.provider !== 'microsoft')
    throw badRequest(tr('Google’s files are picked in Google’s own window.'));
  const access = await filesAccess(ctx, account);
  const base = graph(ctx);
  const select = '$select=id,name,size,folder,file,lastModifiedDateTime';
  let url: string;
  if (query.next) {
    if (!query.next.startsWith(`${base}/`)) throw badRequest(tr('That page isn’t one of these.'));
    url = query.next;
  } else if (query.q) {
    const where = query.folder ? `items/${encodeURIComponent(query.folder)}` : 'root';
    const term = query.q.replace(/'/g, "''");
    url = `${base}/me/drive/${where}/search(q='${encodeURIComponent(term)}')?${select}&$top=${PAGE}`;
  } else {
    const where = query.folder ? `items/${encodeURIComponent(query.folder)}` : 'root';
    url = `${base}/me/drive/${where}/children?${select}&$top=${PAGE}&$orderby=name`;
  }
  const body = await ask(ctx, account, url, access);
  const items = ((body.value as GraphItem[] | undefined) ?? [])
    .map(itemView)
    .filter((i): i is AccountFileView => i !== null)
    // Folders first, as a drive lists them.
    .sort((a, b) => Number(b.folder) - Number(a.folder));
  const next = body['@odata.nextLink'];
  return { items, next: typeof next === 'string' && next.startsWith(`${base}/`) ? next : null };
}

/** The file's name, type, size and where its bytes are read from. */
async function sourceOf(
  ctx: AppContext,
  account: Account,
  fileId: string,
  access: string,
): Promise<{ name: string; mime: string; size: number | null; url: string }> {
  const id = encodeURIComponent(fileId);
  if (account.provider === 'google') {
    const drive = ctx.config.GOOGLE_DRIVE_API.replace(/\/+$/, '');
    const meta = await ask(
      ctx,
      account,
      `${drive}/files/${id}?fields=id,name,mimeType,size&supportsAllDrives=true`,
      access,
    );
    const mime = typeof meta.mimeType === 'string' ? meta.mimeType : 'application/octet-stream';
    const name = typeof meta.name === 'string' && meta.name ? meta.name : 'file';
    const exportAs = GOOGLE_EXPORTS[mime];
    if (exportAs)
      return {
        name: `${name.replace(/\.pdf$/i, '')}.pdf`,
        mime: exportAs,
        size: null,
        url: `${drive}/files/${id}/export?mimeType=${encodeURIComponent(exportAs)}`,
      };
    if (mime.startsWith('application/vnd.google-apps.'))
      throw badRequest(
        tr('That kind of Google file can’t be attached. Pick a document or a file.'),
      );
    const size = Number(meta.size);
    return {
      name,
      mime,
      size: Number.isFinite(size) ? size : null,
      url: `${drive}/files/${id}?alt=media&supportsAllDrives=true`,
    };
  }
  const base = graph(ctx);
  const meta = (await ask(
    ctx,
    account,
    `${base}/me/drive/items/${id}?$select=id,name,size,folder,file`,
    access,
  )) as GraphItem;
  if (meta.folder || !meta.file) throw badRequest(tr('Pick a file, not a folder.'));
  return {
    name: meta.name || 'file',
    mime: meta.file.mimeType || 'application/octet-stream',
    size: typeof meta.size === 'number' ? meta.size : null,
    url: `${base}/me/drive/items/${id}/content`,
  };
}

const tooLarge = () => new AppError(413, 'too_large', tr('That file is over 100 MB.'));

/**
 * Copies a picked file into Caime as the person's own upload: streamed through, hashed and
 * counted on the way, stopped at the upload's cap, and checked against their plan's storage as
 * an upload is. The provider's own address for the bytes (OneDrive's redirect) is followed; the
 * access goes only to the provider's API.
 */
export async function importAccountFile(
  ctx: AppContext,
  storage: Storage,
  account: Account,
  fileId: string,
): Promise<FileRow> {
  const access = await filesAccess(ctx, account);
  const source = await sourceOf(ctx, account, fileId, access);
  if (source.size !== null && source.size > ACCOUNT_FILE_MAX_BYTES) throw tooLarge();
  await assertStorage(ctx, account.user_id, Math.max(1, source.size ?? 1));
  const name = account.provider === 'google' ? 'Google' : 'Microsoft';
  let res: Response;
  try {
    const signal = AbortSignal.timeout(COPY_MS);
    res = await fetch(source.url, {
      headers: { authorization: `Bearer ${access}` },
      redirect: 'manual',
      signal,
    });
    // OneDrive answers with a pre-signed address for the bytes: followed once, and never with
    // the access, which goes to the provider's API alone.
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const to = new URL(location, source.url);
      // Never down from the API's own https (a stand-in's http is its own).
      const from = new URL(source.url).protocol;
      if (to.protocol !== 'https:' && !(to.protocol === 'http:' && from === 'http:'))
        throw new Error('not https');
      res = await fetch(to, { redirect: 'follow', signal });
    }
  } catch {
    throw failed(name);
  }
  if (res.status === 401) {
    await markAccount(ctx, account.id, 'reconnect');
    throw reconnect();
  }
  if (!res.ok || !res.body) throw failed(name);
  const id = uuidv7();
  const tempKey = `tmp/${id}`;
  const hash = createHash('sha256');
  let bytes = 0;
  let over = false;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > ACCOUNT_FILE_MAX_BYTES) {
        over = true;
        cb(tooLarge());
        return;
      }
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  const body = Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>);
  body.on('error', (err) => counter.destroy(err));
  try {
    await storage.write(tempKey, body.pipe(counter));
  } catch (err) {
    await storage.remove(tempKey).catch(() => undefined);
    if (over) throw tooLarge();
    ctx.log.warn({ provider: account.provider, err: (err as Error).name }, 'accounts: copy failed');
    throw failed(name);
  }
  try {
    await assertStorage(ctx, account.user_id, bytes);
  } catch (err) {
    await storage.remove(tempKey).catch(() => undefined);
    throw err;
  }
  return storeFile(ctx, storage, {
    id,
    ownerId: account.user_id,
    tempKey,
    mime: source.mime,
    name: source.name.slice(0, 200),
    durationMs: null,
    sha256: hash.digest('hex'),
  });
}

/** A value written into the page's script: JSON, with nothing that could close the script. */
const inScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/**
 * Google's picker, on a page of its own (R90): the only page of Caime that loads Google's script,
 * under a policy written for it alone (`csp`), so no page of the app ever runs a third party's
 * code. It shows the person's Drive with their own access, and hands back the one file picked:
 * to the window that opened it on the web, to the app's scheme on a phone. Picking grants Caime
 * that file (`drive.file`); nothing else of the drive is reachable.
 */
export function googlePickerPage(
  config: Config,
  opts: { access: string; back: 'web' | 'app'; nonce: string; appScheme: string; title: string },
): { html: string; csp: string } {
  const origin = new URL(config.PUBLIC_URL).origin;
  const settings = {
    token: opts.access,
    key: config.GOOGLE_PICKER_API_KEY,
    app: config.GOOGLE_PICKER_APP_ID,
    origin,
    back: opts.back,
    scheme: `${opts.appScheme}://${ACCOUNT_PICKED_PATH}`,
  };
  const n = opts.nonce;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${opts.title.replace(/[<&]/g, '')}</title></head><body style="margin:0;font-family:system-ui,sans-serif">
<script nonce="${n}">
const s = ${inScript(settings)};
function done(fileId) {
  if (s.back === 'app') {
    location.replace(s.scheme + '#' + (fileId ? 'file=' + encodeURIComponent(fileId) : 'cancel=1'));
    return;
  }
  if (window.opener) window.opener.postMessage({ caimePicked: fileId || null }, s.origin);
  window.close();
}
window.caimeReady = () => gapi.load('picker', open);
function open() {
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);
  new google.picker.PickerBuilder()
    .setOAuthToken(s.token)
    .setDeveloperKey(s.key)
    .setAppId(s.app)
    .setOrigin(s.origin)
    .addView(view)
    .setCallback((d) => {
      if (d.action === google.picker.Action.PICKED) done(d.docs && d.docs[0] && d.docs[0].id);
      else if (d.action === google.picker.Action.CANCEL) done(null);
    })
    .build()
    .setVisible(true);
}
</script>
<script nonce="${n}" src="https://apis.google.com/js/api.js?onload=caimeReady"></script>
</body></html>`;
  const csp = [
    "default-src 'none'",
    // Google's loader by its address, and whatever it loads (strict-dynamic): this page alone.
    `script-src 'nonce-${n}' 'strict-dynamic' https://apis.google.com`,
    "style-src 'unsafe-inline' https://*.google.com https://*.gstatic.com",
    'img-src https: data:',
    'font-src https://*.gstatic.com',
    'frame-src https://docs.google.com https://drive.google.com https://*.google.com',
    'connect-src https://*.googleapis.com https://*.google.com',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return { html, csp };
}
