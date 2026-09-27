import { describe, expect, it } from 'vitest';
import { canSee, defaultPrivacy, readReceiptsVisible, type Viewer } from './privacy';
import { assessLink, isMinor, meetsMinimumAge, searchable } from './safety';

const connected: Viewer = {
  isSelf: false,
  isConnected: true,
  blocked: false,
  ownerSpheresForViewer: ['work'],
};
const stranger: Viewer = {
  isSelf: false,
  isConnected: false,
  blocked: false,
  ownerSpheresForViewer: [],
};

describe('privacy', () => {
  it('defaults: connections see presence, strangers do not; location is never shared by default', () => {
    const s = defaultPrivacy({ minor: false });
    expect(canSee(s, 'lastSeen', connected)).toBe(true);
    expect(canSee(s, 'lastSeen', stranger)).toBe(false);
    expect(canSee(s, 'profilePhoto', stranger)).toBe(true);
    expect(canSee(s, 'location', connected)).toBe(false);
  });

  it("rules by sphere use the owner's classification of the viewer", () => {
    const s = defaultPrivacy({ minor: false });
    s.fields.status = { kind: 'spheres', spheres: ['family', 'friend'] };
    expect(canSee(s, 'status', connected)).toBe(false);
    expect(canSee(s, 'status', { ...connected, ownerSpheresForViewer: ['friend'] })).toBe(true);
  });

  it('a limited relationship preset hides presence even from connections', () => {
    const s = defaultPrivacy({ minor: false });
    expect(canSee(s, 'onlineStatus', { ...connected, preset: 'limited' })).toBe(false);
    expect(canSee(s, 'identityDetails', { ...connected, preset: 'limited' })).toBe(true);
  });

  it('blocked sees nothing; self sees everything', () => {
    const s = defaultPrivacy({ minor: false });
    expect(canSee(s, 'profilePhoto', { ...connected, blocked: true })).toBe(false);
    expect(canSee(s, 'location', { ...stranger, isSelf: true })).toBe(true);
  });

  it('read receipts are reciprocal', () => {
    const open = defaultPrivacy({ minor: false });
    const closed = defaultPrivacy({ minor: false });
    closed.fields.readReceipts = { kind: 'nobody' };
    expect(
      readReceiptsVisible(
        { settings: open, viewerAsSeenByOwner: connected },
        { settings: open, ownerAsSeenByViewer: connected },
      ),
    ).toBe(true);
    expect(
      readReceiptsVisible(
        { settings: open, viewerAsSeenByOwner: connected },
        { settings: closed, ownerAsSeenByViewer: connected },
      ),
    ).toBe(false);
  });

  it('minors are never discoverable by email and only take requests from shared connections (R29)', () => {
    const s = defaultPrivacy({ minor: true });
    expect(s.discoverByEmail).toBe(false);
    expect(s.messageRequests).toBe('shared_connections');
    expect(canSee(s, 'profilePhoto', stranger)).toBe(false);
  });
});

describe('age', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('is conservative with a birth year only', () => {
    expect(isMinor(2008, now)).toBe(true); // 17 or 18: treated as a minor
    expect(isMinor(2007, now)).toBe(false);
    expect(meetsMinimumAge(2013, now)).toBe(false); // 12 or 13
    expect(meetsMinimumAge(2012, now)).toBe(true);
  });
  it('counts the year where someone is: New Year’s Day in Tokyo is still 31 December in UTC', () => {
    const tokyoMorning = new Date('2025-12-31T23:00:00Z');
    expect(meetsMinimumAge(2012, tokyoMorning)).toBe(false);
    expect(meetsMinimumAge(2012, tokyoMorning, 13, 'Asia/Tokyo')).toBe(true);
    expect(meetsMinimumAge(2012, tokyoMorning, 13, 'America/New_York')).toBe(false);
    // A time zone that isn't one counts as UTC.
    expect(meetsMinimumAge(2012, tokyoMorning, 13, 'Nowhere/Else')).toBe(false);
  });
  it('adults never find minors in search', () => {
    expect(searchable(false, true)).toBe(false);
    expect(searchable(true, true)).toBe(true);
    expect(searchable(false, false)).toBe(true);
  });
});

describe('link safety', () => {
  it.each([
    ['https://paypa1-secure.com/login', "Looks like paypal but isn't"],
    ['http://192.168.1.10/pay', 'Uses a raw IP address'],
    ['https://xn--pple-43d.com', 'Uses look-alike characters'],
    ['https://bit.ly/3abc', 'Shortened link hides where it goes'],
    ['https://google.com@evil.example/login', 'Hides the real address behind an @'],
  ])('%s is suspicious', (url, reason) => {
    const a = assessLink(url);
    expect(a.suspicious).toBe(true);
    expect(a.reasons).toContain(reason);
  });
  it.each([
    'https://www.paypal.com/signin',
    'https://docs.google.com/document/d/1',
    'https://example.com/a?b=c',
  ])('%s is fine', (url) => expect(assessLink(url).suspicious).toBe(false));
});
