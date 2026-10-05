/** Which list the desktop shell keeps beside a screen: the one it was opened from. */
import { describe, expect, it, vi } from 'vitest';
import { sectionOf } from './sections';

vi.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}), usePathname: () => '/' }));

describe('desktop sections', () => {
  it('keeps the list a screen came from beside it', () => {
    // The first screen stands alone (R66); Chats is its own place.
    expect(sectionOf('/')).toBe('attention');
    expect(sectionOf('/chats')).toBe('chats');
    expect(sectionOf('/c/0193b3a4-1111-7000-8000-00000000000a')).toBe('chats');
    expect(sectionOf('/updates')).toBe('chats');
    expect(sectionOf('/people')).toBe('people');
    expect(sectionOf('/p/0193b3a4-1111-7000-8000-00000000000a')).toBe('people');
    // Call history opens from People, and from a person's page.
    expect(sectionOf('/calls')).toBe('people');
    expect(sectionOf('/o/nile.dental/inbox')).toBe('business');
    expect(sectionOf('/c/x', 'nile.dental')).toBe('business');
    expect(sectionOf('/settings/plan')).toBe('you');
  });
});
