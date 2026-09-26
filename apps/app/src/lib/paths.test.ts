import { describe, expect, it } from 'vitest';
import { appPath, deepLinkPath, handleIn, ownLinkPath } from './paths';

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

  it('opens a link to Caishy here, and only those', () => {
    const base = 'https://caishy.example';
    expect(ownLinkPath('https://caishy.example/@noor#x', base)).toBe('/@noor');
    expect(ownLinkPath('https://caishy.example.evil.io/@noor', base)).toBeNull();
    expect(ownLinkPath('https://other.example/@noor', base)).toBeNull();
    expect(ownLinkPath('https://caishy.example/@noor', '')).toBeNull();
  });

  it('reads deep links from the web and the app scheme', () => {
    expect(deepLinkPath('https://caishy.example/@noor.haddad')).toBe('/@noor.haddad');
    expect(deepLinkPath('caishy://o/datac')).toBe('/o/datac');
    expect(deepLinkPath('caishy:///@noor')).toBe('/@noor');
    expect(deepLinkPath('https://caishy.example/')).toBeNull();
    expect(deepLinkPath('not a url')).toBeNull();
  });

  it('says whose link it is', () => {
    expect(handleIn('/@noor.haddad')).toBe('noor.haddad');
    expect(handleIn('/o/nile.dental')).toBe('nile.dental');
    expect(handleIn('/c/0192-ab')).toBeNull();
  });
});
