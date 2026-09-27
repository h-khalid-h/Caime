/**
 * The signed-in account. Boot is instant for a returning person: the last known account renders
 * at once from the device, and the server confirms it in the background (a revoked session
 * signs the device out). Signing out removes everything this device kept.
 */
import type { AuthResponse, MeView } from '@caishy/core/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { ApiError, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { persister, queryClient } from '@/api/queryClient';
import { readToken, writeToken } from '@/lib/secure';
import { realtime } from '@/realtime/client';
import { DEFAULT_PREFS, usePrefs } from '@/theme/prefs';
import { useDrafts } from './drafts';
import { useLive } from './live';
import { useLiveShares } from './liveShares';
import { useOutbox } from './outbox';

const USER_KEY = 'caishy.user';

type Status = 'booting' | 'signedOut' | 'signedIn';

interface SessionState {
  status: Status;
  user: MeView | null;
  /** Recovery codes from sign-up, shown once and then forgotten. */
  freshRecoveryCodes: string[] | null;
  boot: () => Promise<void>;
  signedIn: (res: AuthResponse) => Promise<void>;
  setUser: (user: MeView) => void;
  refresh: () => Promise<void>;
  signOut: (opts?: { remote?: boolean }) => Promise<void>;
  clearRecoveryCodes: () => void;
}

export const clientKind: 'web' | 'native' = Platform.OS === 'web' ? 'web' : 'native';

function adoptPreferences(user: MeView): void {
  const p = user.preferences ?? {};
  usePrefs.getState().set({
    theme: p.theme ?? usePrefs.getState().theme,
    personality: p.personality ?? usePrefs.getState().personality,
    bubbleTheme: p.bubbleTheme ?? usePrefs.getState().bubbleTheme,
    enterToSend: p.enterToSend ?? usePrefs.getState().enterToSend,
    reduceMotion: p.reduceMotion ?? usePrefs.getState().reduceMotion,
  });
}

async function remember(user: MeView | null): Promise<void> {
  try {
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(USER_KEY);
  } catch {
    // Storage full or unavailable: the next boot asks the server instead.
  }
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  user: null,
  freshRecoveryCodes: null,

  boot: async () => {
    const [token, cached] = await Promise.all([
      readToken(),
      AsyncStorage.getItem(USER_KEY).catch(() => null),
    ]);
    if (token) setAuthToken(token);
    const user = cached ? (JSON.parse(cached) as MeView) : null;
    if (Platform.OS !== 'web' && !token) {
      set({ status: 'signedOut', user: null });
      return;
    }
    if (user) {
      // Render now; confirm in the background.
      set({ status: 'signedIn', user });
      queryClient.setQueryData(qk.me, { user });
      realtime.start(user.id);
      void get().refresh();
      return;
    }
    try {
      const res = await endpoints.session();
      if (!res.user) {
        set({ status: 'signedOut', user: null });
        return;
      }
      await remember(res.user);
      adoptPreferences(res.user);
      queryClient.setQueryData(qk.me, { user: res.user });
      set({ status: 'signedIn', user: res.user });
      realtime.start(res.user.id);
    } catch {
      set({ status: 'signedOut', user: null });
    }
  },

  signedIn: async (res) => {
    if (res.token) {
      setAuthToken(res.token);
      await writeToken(res.token);
    }
    await remember(res.user);
    adoptPreferences(res.user);
    queryClient.setQueryData(qk.me, { user: res.user });
    set({
      status: 'signedIn',
      user: res.user,
      freshRecoveryCodes: res.recoveryCodes ?? null,
    });
    realtime.start(res.user.id);
  },

  setUser: (user) => {
    set({ user });
    queryClient.setQueryData(qk.me, { user });
    void remember(user);
  },

  refresh: async () => {
    try {
      const res = await endpoints.session();
      if (!res.user) {
        await get().signOut({ remote: false });
        return;
      }
      get().setUser(res.user);
      adoptPreferences(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await get().signOut({ remote: false });
      // Offline: keep the cached account.
    }
  },

  signOut: async ({ remote = true } = {}) => {
    const was = get().user?.id;
    if (remote) await endpoints.logout().catch(() => {});
    // This browser's keys for private conversations go with the session, whether or not they
    // were used since it opened (R18).
    if (was)
      void import('@/features/e2ee/keystore').then((k) => k.forgetDevice(was)).catch(() => {});
    realtime.stop();
    setAuthToken(null);
    await writeToken(null).catch(() => {});
    await remember(null);
    queryClient.clear();
    await persister.removeClient();
    useOutbox.getState().clear();
    useDrafts.getState().reset();
    useLiveShares.getState().clear();
    useLive.getState().reset();
    usePrefs.getState().set(DEFAULT_PREFS);
    set({ status: 'signedOut', user: null, freshRecoveryCodes: null });
  },

  clearRecoveryCodes: () => set({ freshRecoveryCodes: null }),
}));

// Any 401 from a signed-in call means the session is gone (revoked, expired): sign out here too.
setUnauthorizedHandler(() => {
  if (useSession.getState().status === 'signedIn')
    void useSession.getState().signOut({ remote: false });
});

/** The signed-in person's id; screens under the signed-in layout can rely on it. */
export function useMe(): MeView {
  const user = useSession((s) => s.user);
  if (!user) throw new Error('useMe outside a signed-in screen');
  return user;
}
