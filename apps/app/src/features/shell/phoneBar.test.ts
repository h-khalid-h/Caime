import { describe, expect, it } from 'vitest';
import { litPlace, phoneBarShown, placeAt, placePath } from './phoneBar';

describe('the phone’s bar', () => {
  it('stays wherever someone moves between places', () => {
    for (const path of [
      '/',
      '/chats',
      '/people',
      '/spaces',
      '/actions',
      '/search',
      '/@sarah.smith',
      '/o/nile.dental',
      '/o/nile.dental/setup',
      '/o/nile.dental/inbox',
      '/s/0190a8f0-0000-7000-8000-000000000001',
      '/p/0190a8f0-0000-7000-8000-000000000001',
      '/notifications',
      '/requests',
      '/updates',
      '/calls',
      '/you',
      '/settings/notifications',
      '/orgs',
      '/connect',
    ])
      expect([path, phoneBarShown(path)]).toEqual([path, true]);
  });

  it('steps aside where it would sit on what someone’s doing', () => {
    for (const path of [
      '/c/0190a8f0-0000-7000-8000-000000000001',
      '/onboarding',
      '/oauth/authorize',
      '/i/abcdef',
      '/new-group',
      '/new-space',
      '/orgs/new',
    ])
      expect([path, phoneBarShown(path)]).toEqual([path, false]);
  });

  it('lights the place that’s open, or the one someone came from', () => {
    expect(placeAt('/')).toBe('index');
    expect(placeAt('/spaces')).toBe('spaces');
    expect(placeAt('/@sarah')).toBeNull();
    expect(litPlace('/people', 'chats')).toBe('people');
    expect(litPlace('/@sarah', 'chats')).toBe('chats');
    expect(litPlace('/search', 'chats')).toBeNull();
    // Opened straight from a link: no place behind it, so none is lit.
    expect(litPlace('/@sarah', null)).toBeNull();
    expect(placePath('index')).toBe('/');
    expect(placePath('actions')).toBe('/actions');
  });
});
