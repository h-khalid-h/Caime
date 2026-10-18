/**
 * One consent pipeline for contacts and connections (M16 D4): the link each asks for, and the
 * sealed state that rides it, read back only under its own label and before its deadline.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  consentLink,
  openState,
  type ProviderClient,
  refusedAs,
  sealState,
} from '../src/lib/provider-consent';

const client: ProviderClient = {
  id: 'client-1',
  secret: 'not-sent',
  authorize: 'https://accounts.example/authorize',
  token: 'https://accounts.example/token',
  api: 'https://api.example',
};

function params(url: string) {
  const u = new URL(url);
  expect(`${u.origin}${u.pathname}`).toBe(client.authorize);
  return Object.fromEntries(u.searchParams);
}

describe('the consent link', () => {
  it('asks Google for an hour online, the account chosen each time (contacts)', () => {
    const q = params(
      consentLink(client, 'google', {
        redirect: 'https://caime.test/v1/contacts/accounts/google/back',
        scopes: ['a', 'b'],
        state: 's',
        offline: false,
      }),
    );
    expect(q).toEqual({
      client_id: 'client-1',
      redirect_uri: 'https://caime.test/v1/contacts/accounts/google/back',
      response_type: 'code',
      scope: 'a b',
      state: 's',
      prompt: 'select_account',
      access_type: 'online',
    });
  });

  it('asks Google for a refresh token with its consent shown again (a connection)', () => {
    const q = params(
      consentLink(client, 'google', { redirect: 'r', scopes: ['a'], state: 's', offline: true }),
    );
    expect(q.access_type).toBe('offline');
    expect(q.prompt).toBe('consent select_account');
    expect(q.include_granted_scopes).toBe('true');
  });

  it('asks Microsoft for its answer in the query, the account chosen each time', () => {
    for (const offline of [false, true]) {
      const q = params(
        consentLink(client, 'microsoft', { redirect: 'r', scopes: ['a'], state: 's', offline }),
      );
      expect(q.response_mode).toBe('query');
      expect(q.prompt).toBe('select_account');
      expect(q.access_type).toBeUndefined();
    }
  });

  it('never carries the client’s secret', () => {
    const url = consentLink(client, 'google', {
      redirect: 'r',
      scopes: [],
      state: 's',
      offline: true,
    });
    expect(url).not.toContain(client.secret);
  });
});

describe('the sealed state', () => {
  const key = randomBytes(32);
  const now = new Date('2026-10-18T12:00:00Z');

  it('reads back what it sealed, under its own label, before its deadline', () => {
    const raw = sealState(key, { u: 'noor', e: now.getTime() + 60_000 }, 'label a');
    expect(openState<{ u: string; e: number }>(key, raw, 'label a', now)?.u).toBe('noor');
    // Another use's label, another key, after the deadline, or touched: nothing.
    expect(openState(key, raw, 'label b', now)).toBeNull();
    expect(openState(randomBytes(32), raw, 'label a', now)).toBeNull();
    expect(openState(key, raw, 'label a', new Date(now.getTime() + 60_000))).toBeNull();
    const touched = raw.slice(0, 10) + (raw[10] === 'A' ? 'B' : 'A') + raw.slice(11);
    expect(openState(key, touched, 'label a', now)).toBeNull();
    expect(openState(key, 'not base64url!', 'label a', now)).toBeNull();
    expect(openState(key, undefined, 'label a', now)).toBeNull();
  });

  it('says why a return carries nothing from the provider’s own word', () => {
    expect(refusedAs('access_denied')).toBe('denied');
    expect(refusedAs('server_error')).toBe('failed');
    expect(refusedAs(undefined)).toBe('failed');
  });
});
