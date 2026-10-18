/**
 * A check of one's age begun on a phone (M16 B7): the provider's page in the system's sheet (an
 * ASWebAuthenticationSession, a Custom Tab), which closes when the server sends it back to
 * `caime://age-checked?age=…`. The web's is start.ts.
 */
import {
  AGE_APP_RETURN_PATH,
  type AgeReturnState,
  type AgeTrigger,
  ageReturnOf,
} from '@caime/core/age-assurance';
import { APP_SCHEME } from '@caime/core/api';
import * as WebBrowser from 'expo-web-browser';
import { endpoints } from '@/api/endpoints';

export async function startAgeCheck(trigger: AgeTrigger | null): Promise<AgeReturnState | 'left'> {
  const { url } = await endpoints.startAgeCheck('app', trigger);
  const done = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://${AGE_APP_RETURN_PATH}`);
  if (done.type !== 'success') return 'cancel';
  return ageReturnOf(new URL(done.url).searchParams.get('age')) ?? 'waiting';
}
