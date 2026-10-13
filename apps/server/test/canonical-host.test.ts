/**
 * One address (go-live 2026-10-13, lib/canonical-host.ts): a page asked for on any other name the
 * service answers to goes to PUBLIC_URL for good, path and query kept; the API, the operator's
 * metrics and /.well-known answer on every name; a local run is left alone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalLocation } from '../src/lib/canonical-host';
import { createTestApp, type TestApp } from './helpers';

const CAIME = 'https://caime.test';
const at = (host: string | undefined, url: string, method = 'GET') =>
  canonicalLocation(CAIME, { method, host, url });

describe('the one address, as a rule', () => {
  it('sends a page on another name to the same path and query on Caime’s address', () => {
    expect(at('www.caime.test', '/')).toBe('https://caime.test/');
    expect(at('old.example', '/o/nile.dental?write')).toBe(
      'https://caime.test/o/nile.dental?write',
    );
    expect(at('caime-x.host.example:443', '/i/abc?lang=ar', 'HEAD')).toBe(
      'https://caime.test/i/abc?lang=ar',
    );
    expect(at('WWW.Caime.Test.', '/privacy')).toBe('https://caime.test/privacy');
  });

  it('answers on its own name, and where a machine calls, on every name', () => {
    expect(at('caime.test', '/')).toBeNull();
    expect(at('caime.test:443', '/business')).toBeNull();
    for (const url of [
      '/v1/billing/webhook',
      '/v1/calendar/feed/abc.ics',
      '/v1',
      '/v1?x=1',
      '/metrics',
      '/.well-known/oauth-authorization-server',
    ])
      expect(at('old.example', url)).toBeNull();
    // Only a page is moved: nothing that writes is ever redirected.
    expect(at('old.example', '/', 'POST')).toBeNull();
  });

  it('never leads anywhere but Caime’s address', () => {
    expect(at('old.example', '//evil.example/x')).toBeNull();
    expect(at('old.example', 'http://evil.example/')).toBeNull();
    // A backslash is a slash to the URL parser: "/\\evil.example" names another host too.
    expect(at('old.example', '/\\evil.example')).toBeNull();
  });

  it('leaves a local run, a health check by address and a local Caime alone', () => {
    for (const host of [
      'localhost:8787',
      '127.0.0.1:8787',
      '[::1]:8787',
      '10.0.0.5',
      'app.localhost',
    ])
      expect(at(host, '/')).toBeNull();
    expect(at(undefined, '/')).toBeNull();
    expect(
      canonicalLocation('http://localhost:8787', { method: 'GET', host: 'box.lan', url: '/' }),
    ).toBeNull();
  });
});

describe('the one address, served', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ PUBLIC_URL: CAIME });
  });
  afterAll(() => t.close());

  it('redirects a page on another name for good and answers the API there', async () => {
    const page = await t.app.inject({
      url: '/o/nile.dental?write',
      headers: { host: 'www.caime.test', accept: 'text/html' },
    });
    expect(page.statusCode).toBe(301);
    expect(page.headers.location).toBe('https://caime.test/o/nile.dental?write');
    const api = await t.app.inject({ url: '/v1/healthz', headers: { host: 'old.example' } });
    expect(api.statusCode).toBe(200);
    const discovery = await t.app.inject({
      url: '/.well-known/oauth-authorization-server',
      headers: { host: 'old.example' },
    });
    expect(discovery.statusCode).toBe(200);
    expect(discovery.json().issuer).toBe(CAIME);
    const own = await t.app.inject({ url: '/v1/healthz', headers: { host: 'caime.test' } });
    expect(own.statusCode).toBe(200);
  });
});
