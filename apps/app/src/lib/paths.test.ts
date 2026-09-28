import { describe, expect, it } from 'vitest';
import { appPath, deepLinkPath, handleIn, isAuthorizeLink, ownLinkPath } from './paths';

describe('paths from links', () => {
  it('opens places in the app, never the way in or somewhere else', () => {
    for (const ok of ['/@noor.haddad', '/o/nile.dental', '/c/0192-ab', '/connect?h=sara.ali'])
      expect(appPath(ok)).toBe(ok);
    for (const bad of [
      '/',
      '/welcome',
      '/sign-in?next=x',
      '/onboarding',
      '//evil.example/x',
      '/\\evil.example',
      '/javascript:alert(1)',
      '/x y',
      'https://evil.example',
      '',
      null,
    ])
      expect(appPath(bad)).toBeNull();
    expect(appPath('/welcomeback')).toBe('/welcomeback');
  });

  it('keeps an app’s authorization request whole, colons in its query included', () => {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: 'app_Qm9vayBjbHViIGRpZ2VzdA',
      redirect_uri: 'https://digest.example/callback',
      scope: 'messages:read messages:write',
      state: 'c2f5a8e1b7d94f06a3e2c1b0d9f8e7a6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a190',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    });
    const link = `/oauth/authorize?${q}`;
    expect(link.length).toBeGreaterThan(300);
    expect(appPath(link)).toBe(link);
    // As a browser leaves a hand-built one: the colons unencoded.
    const raw = '/oauth/authorize?client_id=app_x&scope=messages:read%20messages:write';
    expect(appPath(raw)).toBe(raw);
    expect(isAuthorizeLink(raw)).toBe(true);
    expect(isAuthorizeLink('/oauth/authorized')).toBe(false);
    expect(appPath(`/oauth/authorize?state=${'x'.repeat(1000)}`)).toBeNull();
    expect(appPath('/c:/x')).toBeNull();
  });

  it('opens a link to Caime here, and only those', () => {
    const base = 'https://caime.example';
    expect(ownLinkPath('https://caime.example/@noor#x', base)).toBe('/@noor');
    expect(ownLinkPath('https://caime.example.evil.io/@noor', base)).toBeNull();
    // Caime's own pages open as pages: in the app they'd be nothing there. Never remembered
    // as a place to come back to after signing in either.
    for (const page of [
      'privacy',
      'terms',
      'help',
      'help/',
      'terms?x=1',
      'privacy#children',
      'Privacy',
    ]) {
      expect(ownLinkPath(`${base}/${page}`, base)).toBeNull();
      expect(appPath(`/${page}`)).toBeNull();
    }
    expect(appPath('/helpers')).toBe('/helpers');
    expect(ownLinkPath(`${base}/@help`, base)).toBe('/@help');
    expect(ownLinkPath(`${base}/o/help`, base)).toBe('/o/help');
    expect(ownLinkPath('https://other.example/@noor', base)).toBeNull();
    expect(ownLinkPath('https://caime.example/@noor', '')).toBeNull();
  });

  it('reads deep links from the web and the app scheme', () => {
    expect(deepLinkPath('https://caime.example/@noor.haddad')).toBe('/@noor.haddad');
    expect(deepLinkPath('caime://o/datac')).toBe('/o/datac');
    expect(deepLinkPath('caime:///@noor')).toBe('/@noor');
    expect(deepLinkPath('https://caime.example/')).toBeNull();
    expect(deepLinkPath('not a url')).toBeNull();
  });

  it('says whose link it is', () => {
    expect(handleIn('/@noor.haddad')).toBe('noor.haddad');
    expect(handleIn('/o/nile.dental')).toBe('nile.dental');
    expect(handleIn('/c/0192-ab')).toBeNull();
  });
});
