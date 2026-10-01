import { describe, expect, it } from 'vitest';
import { canSee, defaultPrivacy, readReceiptsVisible, type Viewer } from './privacy';
import {
  ageOn,
  assessLink,
  isMinor,
  meetsMinimumAge,
  plausibleBirthDate,
  searchable,
} from './safety';

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

  it('in a meeting (R51): connections see busy or free, family what it is, limited nothing', () => {
    const s = defaultPrivacy({ minor: false });
    expect(canSee(s, 'busy', connected)).toBe(true);
    expect(canSee(s, 'busy', stranger)).toBe(false);
    expect(canSee(s, 'busyDetails', connected)).toBe(false);
    expect(canSee(s, 'busyDetails', { ...connected, ownerSpheresForViewer: ['family'] })).toBe(
      true,
    );
    expect(canSee(s, 'busy', { ...connected, preset: 'limited' })).toBe(false);
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
  const now = new Date('2026-06-01T12:00:00Z');
  it('is exact, from the date of birth', () => {
    expect(ageOn('2008-06-01', now)).toBe(18);
    expect(ageOn('2008-06-02', now)).toBe(17);
    expect(isMinor('2008-06-02', now)).toBe(true);
    expect(isMinor('2008-06-01', now)).toBe(false);
    expect(meetsMinimumAge('2013-06-01', now)).toBe(true);
    expect(meetsMinimumAge('2013-06-02', now)).toBe(false);
    // An app or an agent has no date of birth; one that isn't a date is nobody's to trust.
    expect(isMinor(null, now)).toBe(false);
    expect(isMinor('2008-02-30', now)).toBe(true);
    expect(meetsMinimumAge('not a day', now)).toBe(false);
  });
  it('comes on the birthday where someone is: in Tokyo it is already 1 June', () => {
    const tokyoMorning = new Date('2026-05-31T20:00:00Z');
    expect(isMinor('2008-06-01', tokyoMorning)).toBe(true);
    expect(isMinor('2008-06-01', tokyoMorning, 'Asia/Tokyo')).toBe(false);
    expect(isMinor('2008-06-01', tokyoMorning, 'America/New_York')).toBe(true);
    expect(meetsMinimumAge('2013-06-01', tokyoMorning, 13, 'Asia/Tokyo')).toBe(true);
    // A time zone that isn't one counts as UTC.
    expect(meetsMinimumAge('2013-06-01', tokyoMorning, 13, 'Nowhere/Else')).toBe(false);
  });
  it('takes 29 February as 1 March in the years without one', () => {
    expect(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(17);
    expect(ageOn('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(18);
    expect(ageOn('2008-02-29', new Date('2028-02-29T12:00:00Z'))).toBe(20);
  });
  it('takes a date of birth only when it is a real day that has come', () => {
    expect(plausibleBirthDate('1990-05-17', now)).toBe(true);
    expect(plausibleBirthDate('2026-06-01', now)).toBe(true);
    expect(plausibleBirthDate('2026-06-02', now)).toBe(false);
    expect(plausibleBirthDate('2026-06-02', new Date('2026-06-01T20:00:00Z'), 'Asia/Tokyo')).toBe(
      true,
    );
    expect(plausibleBirthDate('1990-02-30', now)).toBe(false);
    // 120 at most: the day before the 121st birthday, and not on it.
    expect(plausibleBirthDate('1905-06-02', now)).toBe(true);
    expect(plausibleBirthDate('1905-06-01', now)).toBe(false);
    expect(plausibleBirthDate('17/05/1990', now)).toBe(false);
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
