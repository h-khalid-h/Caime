/**
 * Google's picker on a phone (R90): its own page on Caime in the system's sign-in sheet, which
 * closes when the page sends it to `caime://picked` with the file picked. The web's is
 * googlePicker.ts.
 */
import { ACCOUNT_PICKED_PATH } from '@caime/core/accounts';
import { APP_SCHEME } from '@caime/core/api';
import * as WebBrowser from 'expo-web-browser';
import { endpoints } from '@/api/endpoints';

export async function pickFromGoogle(accountId: string): Promise<string | null> {
  const { url } = await endpoints.accountPicker(accountId, 'app');
  const done = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://${ACCOUNT_PICKED_PATH}`);
  if (done.type !== 'success') return null;
  const file = new URLSearchParams(done.url.split('#')[1] ?? '').get('file');
  return file || null;
}
