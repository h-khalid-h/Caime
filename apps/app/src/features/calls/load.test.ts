import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loaderOf } from './load.web';

/** A fetch that fails until `up`, as the calls' file does with no network. */
function flaky() {
  const state = { up: false };
  const fetch = vi.fn(async () => {
    if (!state.up) throw new Error('offline');
    return 'stack';
  });
  return { state, fetch };
}

describe('the calls, loaded when they are needed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('are fetched once, and kept', async () => {
    const fetch = vi.fn(async () => 'stack');
    const calls = loaderOf(fetch);
    const got = await Promise.all([calls.load(), calls.load(), calls.loadedOr('live', () => {})]);
    expect(got).toEqual(['stack', 'stack', 'stack']);
    expect(await calls.load()).toBe('stack');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('owe what couldn’t be done while they couldn’t load, and do it once, when they do', async () => {
    const { state, fetch } = flaky();
    const calls = loaderOf(fetch);
    const done: string[] = [];
    expect(await calls.loadedOr('live', (s) => done.push(`live ${s}`))).toBeNull();
    // One of each: the latest.
    expect(await calls.loadedOr('live', (s) => done.push(`live again ${s}`))).toBeNull();
    expect(await calls.loadedOr('in:c1', (s) => done.push(`in ${s}`))).toBeNull();
    state.up = true;
    // The next use fetches again.
    expect(await calls.load()).toBe('stack');
    await vi.advanceTimersByTimeAsync(0);
    expect(done.sort()).toEqual(['in stack', 'live again stack']);
    await calls.load();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toHaveLength(2);
  });

  it('try again on their own, five times, further apart each time, and then when used', async () => {
    const { fetch } = flaky();
    const calls = loaderOf(fetch);
    await expect(calls.load()).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8000 + 16_000 + 32_000);
    expect(fetch).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetch).toHaveBeenCalledTimes(6);
    // Back online with nothing owed, there's nothing to fetch for.
    calls.online();
    expect(fetch).toHaveBeenCalledTimes(6);
    await expect(calls.load()).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('do what was owed when a try of their own gets them', async () => {
    const { state, fetch } = flaky();
    const calls = loaderOf(fetch);
    const done: string[] = [];
    expect(await calls.loadedOr('live', (s) => done.push(s))).toBeNull();
    state.up = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toEqual(['stack']);
  });

  it('are fetched at once when the browser is back online and something is owed', async () => {
    const { state, fetch } = flaky();
    const calls = loaderOf(fetch);
    const done: string[] = [];
    expect(await calls.loadedOr('live', (s) => done.push(s))).toBeNull();
    state.up = true;
    calls.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual(['stack']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keep going when something owed fails', async () => {
    const { state, fetch } = flaky();
    const calls = loaderOf(fetch);
    const done: string[] = [];
    await calls.loadedOr('a', () => {
      throw new Error('broke');
    });
    await calls.loadedOr('b', (s) => done.push(s));
    state.up = true;
    expect(await calls.load()).toBe('stack');
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual(['stack']);
  });
});
