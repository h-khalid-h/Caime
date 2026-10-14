/**
 * Connecting a Google or Microsoft account on a phone (R90): the consent in the system's sign-in
 * sheet (an ASWebAuthenticationSession, a Custom Tab), which closes when the server sends it back
 * to `caime://settings/apps` with a sealed claim the screen then redeems. Nothing waits in the
 * address. The web's is connect.ts.
 */
import {
  ACCOUNT_RETURN_PATH,
  type AccountProvider,
  type AccountReturn,
  type AccountUse,
  accountReturnOf,
} from '@caime/core/accounts';
import { APP_SCHEME } from '@caime/core/api';
import * as WebBrowser from 'expo-web-browser';
import { endpoints } from '@/api/endpoints';
export function accountReturned(): AccountReturn | null {
  return null;
}

export function doneWithAccountReturn(): void {}

export async function connectAccount(
  provider: AccountProvider,
  uses: AccountUse[],
): Promise<AccountReturn | 'left'> {
  const { url } = await endpoints.startAccount(provider, { uses, back: 'app' });
  const done = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://${ACCOUNT_RETURN_PATH}`);
  if (done.type !== 'success') return { provider, cancelled: true };
  return accountReturnOf(done.url.split('#')[1] ?? '') ?? { provider, error: 'failed' };
}
