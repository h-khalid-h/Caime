/**
 * What the app makes of the server's answers: the API's errors as they are, and anything that
 * isn't the API answering (a proxy's page while a deploy restarts it) as no network at all, so
 * what waits on the device keeps waiting rather than failing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({ API_URL: 'https://caishy.example', isWeb: false }));

const answer = (status: number, body: string) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => body }));

afterEach(() => vi.unstubAllGlobals());

describe('the API client', () => {
  it('says what the API said when it refuses', async () => {
    vi.stubGlobal(
      'fetch',
      answer(409, JSON.stringify({ error: { code: 'saved_full', message: 'Remove some.' } })),
    );
    const { api, ApiError } = await import('./client');
    const err = await api.post('/messages/m1/save').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'saved_full', message: 'Remove some.' });
  });

  it('takes a page that isn’t the API’s for no network', async () => {
    const { api, NetworkError } = await import('./client');
    for (const [status, body] of [
      [502, 'Bad Gateway'],
      [503, '<html><body>Service Unavailable</body></html>'],
      [404, '404 page not found'],
      [200, '<!doctype html><title>Sign in to the Wi-Fi</title>'],
    ] as const) {
      vi.stubGlobal('fetch', answer(status, body));
      expect(await api.get('/inbox').catch((e) => e), body).toBeInstanceOf(NetworkError);
    }
  });
});
