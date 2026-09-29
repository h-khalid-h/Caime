/**
 * Both call engines and their screens (stack.ts), fetched the first time something needs
 * them, and kept. A fetch that fails (no network, a server restarting mid-deploy) is tried
 * again: by the next thing that needs them, on its own a few times, and when the browser is back
 * online. What couldn't be done meanwhile is owed, and done once they're in: a call that rang,
 * or a group's call that began, while they couldn't load is asked for again then.
 */
type Stack = typeof import('./stack');

/** How many times a failed fetch is tried again on its own, 2 s, 4 s, … apart. */
const RETRIES = 5;

export function loaderOf<T>(fetch: () => Promise<T>) {
  let loading: Promise<T> | null = null;
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const owed = new Map<string, (loaded: T) => unknown>();

  function load(): Promise<T> {
    loading ??= fetch().then(
      (loaded) => {
        const due = [...owed.values()];
        owed.clear();
        for (const run of due)
          Promise.resolve()
            .then(() => run(loaded))
            .catch(() => {});
        return loaded;
      },
      (err: unknown) => {
        loading = null;
        if (!retry && tries < RETRIES)
          retry = setTimeout(
            () => {
              retry = null;
              load().catch(() => {});
            },
            2000 * 2 ** tries++,
          );
        throw err;
      },
    );
    return loading;
  }

  /** What's loaded, or null while it can't load: `later` (one per `key`) is done once it does. */
  async function loadedOr(key: string, later: (loaded: T) => unknown): Promise<T | null> {
    try {
      return await load();
    } catch {
      owed.set(key, later);
      return null;
    }
  }

  /** Back online: what's owed is tried again at once. */
  function online(): void {
    if (owed.size) load().catch(() => {});
  }

  return { load, loadedOr, online };
}

const calls = loaderOf<Stack>(() => import('./stack'));
export const loadCallStack = calls.load;
export const callStackOr = calls.loadedOr;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('online', calls.online);
