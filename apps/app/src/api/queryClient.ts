/**
 * Server state lives in TanStack Query and is persisted on the device, so a returning person
 * sees their inbox and recent conversations instantly, online or not (COMPETITIVE.md budgets:
 * cached inbox < 150 ms, cached conversation < 100 ms).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { dehydrate, focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';
import { onNetworkChange } from '@/lib/network';
import { ApiError, NetworkError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60_000,
      networkMode: 'offlineFirst',
      retry: (count, err) => {
        if (err instanceof NetworkError) return count < 3;
        if (err instanceof ApiError) return err.status >= 500 && count < 2;
        return count < 1;
      },
    },
    mutations: { networkMode: 'offlineFirst', retry: false },
  },
});

/** Only what makes the next launch instant: never search results, never more than a page. */
const NOT_PERSISTED = new Set(['search', 'people-search', 'sessions', 'relationship-history']);
const MAX_CONVERSATIONS = 30;

function trim(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.filter(
    (q) => q.state.status === 'success' && !NOT_PERSISTED.has(String(q.queryKey[0])),
  );
  const messageQueries = queries
    .filter((q) => q.queryKey[0] === 'messages')
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const keep = new Set(messageQueries.slice(0, MAX_CONVERSATIONS));
  const out = queries
    .filter((q) => q.queryKey[0] !== 'messages' || keep.has(q))
    .map((q) => {
      if (q.queryKey[0] !== 'messages') return q;
      const data = q.state.data as { pages: unknown[]; pageParams: unknown[] } | undefined;
      if (!data?.pages) return q;
      return {
        ...q,
        state: {
          ...q.state,
          data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
        },
      };
    });
  return { ...client, clientState: { ...client.clientState, queries: out, mutations: [] } };
}

const CACHE_KEY = 'caime.cache.v1';

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: CACHE_KEY,
  throttleTime: 1500,
  serialize: (client) => JSON.stringify(trim(client)),
});

let restored = false;

/**
 * Saved at once, not a moment later as the persister's throttle would: the next launch opens on
 * what was last shown, never on a photo taken out of an album the second before. Only once the
 * saved cache is back, so leaving while it loads never overwrites it with nothing.
 */
export function saveCacheNow(buster: string): void {
  if (!restored) return;
  const client: PersistedClient = {
    buster,
    timestamp: Date.now(),
    clientState: dehydrate(queryClient),
  };
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trim(client))).catch(() => {});
}

/** Once the saved cache is back: it's saved again whenever the page or the app is left. */
export function saveCacheWhenLeft(buster: string): void {
  if (restored) return;
  restored = true;
  const save = () => saveCacheNow(buster);
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') save();
    });
    return;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

/**
 * Bump when a cached shape changes incompatibly (a view gains a field the screens rely on): old
 * caches, and the account kept on the device (state/session.ts), are dropped, not misread.
 * 2: connections say who's merged into whom (PRD §51). 3: a conversation lists its topics, and a
 * one-to-one says whether it's between connections (§58). 4: a person's page says who they are to
 * you (§67), and a conversation's details and a space's page say what's coming up (§41). 5: you
 * have a date of birth and a country (a currency from it), not a birth year and a region; an
 * organization has a country, a currency and a founding year.
 */
export const CACHE_VERSION = '5';

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60_000;

// Online and focus signals: lib/network on every platform, AppState on native.
onlineManager.setEventListener((setOnline) => onNetworkChange(setOnline));

if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
}
