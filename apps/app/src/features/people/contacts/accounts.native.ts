/**
 * An account's contacts on a phone (R89): its consent in the system's sign-in sheet (an
 * ASWebAuthenticationSession, a Custom Tab), which closes when the server sends it back to
 * `caime://connect` with the access sealed for the key made here; nothing leaves the app's
 * memory. The web's is accounts.web.ts.
 */
import { APP_SCHEME } from '@caime/core/api';
import {
  CONTACT_RETURN_PATH,
  type ContactAccount,
  type ContactReturn,
  contactReturnOf,
} from '@caime/core/contact-return';
import { newContactKey } from '@caime/core/contact-seal';
import * as WebBrowser from 'expo-web-browser';
import { endpoints } from '@/api/endpoints';
import { type AccountOutcome, openedReturn } from './opened';

export type { AccountOutcome };

export async function startAccount(account: ContactAccount): Promise<AccountOutcome | 'left'> {
  const key = newContactKey();
  const { url } = await endpoints.startContactAccount(account, { key, back: 'app' });
  const back = `${APP_SCHEME}://${CONTACT_RETURN_PATH}`;
  const done = await WebBrowser.openAuthSessionAsync(url, back);
  if (done.type !== 'success') return { account, cancelled: true };
  const r = contactReturnOf(done.url.split('#')[1] ?? '');
  return r ? openedReturn(r, key) : { account, error: 'failed' };
}

/** A phone's consent returns to the sheet that asked (`returned.native.ts` gives none). */
export function openAccountReturn(r: ContactReturn): AccountOutcome {
  return openedReturn(r, null);
}
