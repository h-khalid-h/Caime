import { API_URL, isWeb } from '@/lib/config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
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
}

export async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
  if (isWeb) headers['x-caishy-client'] = 'web';
  if (token) headers.authorization = `Bearer ${token}`;
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
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized?.();
    const e = data?.error ?? {};
    throw new ApiError(
      res.status,
      e.code ?? 'error',
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
