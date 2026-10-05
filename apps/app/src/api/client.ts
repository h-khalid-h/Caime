import type { ErrorCode } from '@caime/core/errors';
import { API_URL, isWeb } from '@/lib/config';
import { useLanguage } from '@/lib/languageState';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: {
      fields?: Array<{ path: string; message: string }>;
      [k: string]: unknown;
    },
  ) {
    super(message);
  }

  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.details?.fields ?? []) if (!out[f.path]) out[f.path] = f.message;
    return out;
  }
}

export class NetworkError extends Error {
  constructor() {
    // Messages and actions wait on the device (they say so themselves); anything else needs
    // doing again.
    super('You’re offline. Try again when you’re back.');
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
let expectedUser: string | null = null;
let onWrongAccount: (() => void) | null = null;

/**
 * Whose account this app is showing. Every call says so, and the server refuses one that finds
 * someone else signed in (another tab of the browser signed in as them since), so nothing meant
 * as one person, a queued message or action above all, ever goes as another.
 */
export function setExpectedUser(id: string | null): void {
  expectedUser = id;
}

/** What happens when the server, or the realtime socket, finds someone else signed in. */
export function setWrongAccountHandler(handler: () => void): void {
  onWrongAccount = handler;
}

export function wrongAccount(): void {
  onWrongAccount?.();
}

/** Calls that find out, or decide, who is signed in: they're sent as nobody in particular. */
const WHOEVER = new Set(['/auth/session', '/auth/login', '/auth/signup', '/auth/recover']);

export function setAuthToken(value: string | null): void {
  token = value;
}

export function getAuthToken(): string | null {
  return token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Raw body (uploads). */
  raw?: BodyInit;
  /** Let the request outlive the page (a setting saved as the tab goes). */
  keepalive?: boolean;
}

export async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
  if (isWeb) headers['x-caime-client'] = 'web';
  // The language this device shows, so the server's words in the answer are in it (R54).
  const language = useLanguage.getState().language;
  if (language) headers['x-caime-language'] = language;
  if (token) headers.authorization = `Bearer ${token}`;
  if (expectedUser && !WHOEVER.has(path.split('?')[0] ?? ''))
    headers['x-caime-user'] = expectedUser;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined && !opts.raw) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method,
      headers,
      body,
      credentials: isWeb ? 'include' : 'omit',
      signal: opts.signal,
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }
  const text = await res.text();
  let data:
    | { error?: { code?: ErrorCode; message?: string; details?: ApiError['details'] } }
    | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Not the API answering (a proxy's page while a deploy restarts it, a captive portal): as
    // good as no network, so what's waiting to go waits rather than failing or being dropped.
    throw new NetworkError();
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized?.();
    const e = data?.error ?? {};
    if (res.status === 409 && e.code === 'wrong_account') onWrongAccount?.();
    // Suspended by the operator (R49): out, and told why by the message that came with it.
    if (res.status === 403 && e.code === 'suspended' && path !== '/auth/login') onUnauthorized?.();
    throw new ApiError(
      res.status,
      e.code ?? 'internal',
      e.message ?? 'Something went wrong.',
      e.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  del: <T>(path: string, body?: unknown) =>
    request<T>('DELETE', path, body === undefined ? {} : { body }),
};

/** Absolute URL for media the server serves (images, files, avatars). */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

export function mediaHeaders(): Record<string, string> | undefined {
  return token ? { authorization: `Bearer ${token}` } : undefined;
}
