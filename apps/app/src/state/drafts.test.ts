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
// The app's own client reads the device (React Native); a plain one holds the views the same way.
vi.mock('@/api/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

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

  it('leave the cached view too, so nothing mounted again takes the sent words back (2026-10-26)', async () => {
    const { useDrafts } = await import('./drafts');
    const { queryClient } = await import('@/api/queryClient');
    const { qk } = await import('@/api/keys');
    // The view read again after the pause's save carries the part written by then.
    const view = (draft: string | null) => ({
      conversation: { id: 'standard-1', me: { draft, role: 'member' } },
    });
    queryClient.setQueryData(qk.conversation('standard-1'), view('Running late'));
    useDrafts.getState().set('standard-1', 'Running late, there in ten minutes');
    useDrafts.getState().clear('standard-1');
    expect(queryClient.getQueryData(qk.conversation('standard-1'))).toEqual(view(null));
    // A save on its way when the message went is taken back, and the view read again in the
    // meantime with its words is cleared with it.
    let land: (() => void) | undefined;
    h.endpoints.updateConversation.mockImplementationOnce(
      () =>
        new Promise<object>((resolve) => {
          land = () => resolve({});
        }),
    );
    useDrafts.getState().set('standard-1', 'See you there');
    await vi.advanceTimersByTimeAsync(1500);
    useDrafts.getState().clear('standard-1');
    queryClient.setQueryData(qk.conversation('standard-1'), view('See you there'));
    land?.();
    await vi.advanceTimersByTimeAsync(10);
    expect(queryClient.getQueryData(qk.conversation('standard-1'))).toEqual(view(null));
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
