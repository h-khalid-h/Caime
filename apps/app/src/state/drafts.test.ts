/**
 * Drafts: kept on the device and mirrored to the account, except in a private conversation (R18),
 * where what's being written is only held while the app is open: never sent, never stored.
 * Signing out forgets them all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const stored = new Map<string, string>();
  return {
    stored,
    storage: {
      getItem: vi.fn(async (k: string) => stored.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => void stored.set(k, v)),
      removeItem: vi.fn(async (k: string) => void stored.delete(k)),
    },
    endpoints: { updateConversation: vi.fn(async () => ({})) },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: h.storage }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  h.stored.clear();
  h.endpoints.updateConversation.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('drafts', () => {
  it('are mirrored to the account, but a private conversation’s never leaves the app', async () => {
    const { useDrafts } = await import('./drafts');
    useDrafts.getState().set('standard-1', 'See you at 6');
    useDrafts.getState().setLocal('private-1', 'The door code is 4471');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.endpoints.updateConversation).toHaveBeenCalledTimes(1);
    expect(h.endpoints.updateConversation).toHaveBeenCalledWith('standard-1', {
      draft: 'See you at 6',
    });
    expect(useDrafts.getState().local['private-1']).toBe('The door code is 4471');
    // What's kept on the device has the one, never the other.
    const kept = [...h.stored.values()].join('');
    expect(kept).toContain('See you at 6');
    expect(kept).not.toContain('4471');
  });

  it('are all forgotten on signing out', async () => {
    const { useDrafts } = await import('./drafts');
    useDrafts.getState().set('standard-1', 'half a thought');
    useDrafts.getState().setLocal('private-1', 'the other half');
    useDrafts.getState().reset();
    await vi.advanceTimersByTimeAsync(2000);
    expect(useDrafts.getState().drafts).toEqual({});
    expect(useDrafts.getState().local).toEqual({});
    expect(h.endpoints.updateConversation).not.toHaveBeenCalled();
    expect([...h.stored.values()].join('')).not.toContain('half');
  });
});
