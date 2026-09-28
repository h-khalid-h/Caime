/**
 * What the screens decide about private conversations (R18), apart from React: in one, nothing
 * unsealed is shown as a message, nothing is written from a device that saw it as private once
 * the server says otherwise, or from one waiting to be approved, and an opened message's links
 * are checked on the device.
 */
import type { MessageView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { readAs, suspiciousLink, whyNotWritten } from './hooks';

const sealed = { v: 1 } as unknown as MessageView['sealed'];
const m = (kind: MessageView['kind'], withSeal: boolean) => ({
  kind,
  sealed: withSeal ? sealed : null,
});

describe('private conversations on screen (R18)', () => {
  it('in one, only sealed text is shown as a message', () => {
    const here = { private: true };
    expect(readAs(m('text', true), here)).toBe('sealed');
    // Words in the clear, a card, a file or a poll didn't come from anyone's device.
    for (const kind of ['text', 'kit', 'poll', 'media', 'file', 'location'] as const)
      expect(readAs(m(kind, false), here)).toBe('unverified');
    // Nor does a card with someone's envelope stuck on it.
    expect(readAs(m('kit', true), here)).toBe('unverified');
    // Its own lines (someone joined, messages disappear) are shown as they are.
    expect(readAs(m('system', false), here)).toBe('plain');
    // Elsewhere, messages are what they are.
    expect(readAs(m('text', false), { private: false })).toBe('plain');
    expect(readAs(m('kit', false), { private: false })).toBe('plain');
  });

  it('nothing is written from here once the server says a private one isn’t, nor while waiting', () => {
    expect(whyNotWritten({ private: true }, false, 'approved')).toMatch(
      /^This conversation was private on this device, and Caime now says it isn’t/,
    );
    expect(whyNotWritten({ private: true }, true, 'waiting')).toMatch(
      /once you approve it on another device/,
    );
    expect(whyNotWritten({ private: true }, true, 'approved')).toBeNull();
    expect(whyNotWritten({ private: true }, true, null)).toBeNull();
    expect(whyNotWritten({ private: false }, false, null)).toBeNull();
  });

  it('a private message’s links are checked here, from its words', async () => {
    const lookalike = 'https://paypa1.com/login';
    expect(await suspiciousLink({ sealed, entities: {} }, lookalike)).toBe(true);
    expect(await suspiciousLink({ sealed, entities: {} }, 'https://caime.example/about')).toBe(
      false,
    );
    // Elsewhere, as the server found them.
    expect(await suspiciousLink({ sealed: null, entities: {} }, lookalike)).toBe(false);
    expect(
      await suspiciousLink(
        { sealed: null, entities: { links: [{ url: lookalike, suspicious: true }] } },
        lookalike,
      ),
    ).toBe(true);
  });
});
