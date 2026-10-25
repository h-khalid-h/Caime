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

  it('take back a save that was on its way when the message went (2026-10-25)', async () => {
    const { useDrafts } = await import('./drafts');
    // The account hears the draft 1.5 s after the last keystroke; the message goes while that
    // request is still in flight, and the send clears the draft here and on the account.
    let land: (() => void) | undefined;
    h.endpoints.updateConversation.mockImplementationOnce(
      () =>
        new Promise<object>((resolve) => {
          land = () => resolve({});
        }),
    );
    useDrafts.getState().set('standard-1', 'Did you update its due dates');
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.endpoints.updateConversation).toHaveBeenCalledTimes(1);
    useDrafts.getState().clear('standard-1');
    expect(useDrafts.getState().drafts['standard-1']).toBeUndefined();
    // The stale save lands after the send: it's taken back, so no device shows the sent words
    // as a draft again.
    land?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.endpoints.updateConversation).toHaveBeenCalledTimes(2);
    expect(h.endpoints.updateConversation).toHaveBeenLastCalledWith('standard-1', { draft: null });
    // A save that landed before any clear is kept as synced: cleared later, nothing is sent.
    useDrafts.getState().set('standard-2', 'half a thought');
    await vi.advanceTimersByTimeAsync(1600);
    expect(h.endpoints.updateConversation).toHaveBeenCalledTimes(3);
    useDrafts.getState().clear('standard-2');
    await vi.advanceTimersByTimeAsync(1600);
    expect(h.endpoints.updateConversation).toHaveBeenCalledTimes(3);
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
