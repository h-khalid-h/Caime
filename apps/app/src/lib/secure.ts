/**
 * The session token on native lives in the platform keychain (ADR-7). On web there is no token
 * in JavaScript at all: the session is an httpOnly cookie.
 */
import * as SecureStore from 'expo-secure-store';
import { isWeb } from './config';

const KEY = 'caime.session';

export async function readToken(): Promise<string | null> {
  if (isWeb) return null;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeToken(token: string | null): Promise<void> {
  if (isWeb) return;
  if (token)
    await SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  else await SecureStore.deleteItemAsync(KEY);
}
