/**
 * Server state lives in TanStack Query and is persisted on the device, so a returning person
 * sees their inbox and recent conversations instantly, online or not (COMPETITIVE.md budgets:
 * cached inbox < 150 ms, cached conversation < 100 ms).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';
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

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'caishy.cache.v1',
  throttleTime: 1500,
  serialize: (client) => JSON.stringify(trim(client)),
});

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60_000;

// Online and focus signals: NetInfo on every platform, AppState on native.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
}
