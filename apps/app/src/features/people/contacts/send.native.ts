/**
 * An invitation sent by the person, from their own phone (R89): a text in the system's own
 * composer over Caime (expo-sms), WhatsApp and mail in their apps. Caime sends nothing itself.
 */
import type { InviteWay } from '@caime/core/contact-invites';
import * as SMS from 'expo-sms';
import { Linking, Platform } from 'react-native';

/** Whether this device sends texts, and writes their body after "&" (an iPhone's). */
export const textsHere = true;
export const iosTexts = Platform.OS === 'ios';

/** Opens the way with the words written; false when the person closed it without sending. */
export async function sendInvite(way: InviteWay, words: string): Promise<boolean> {
  if (way.kind === 'sms' && (await SMS.isAvailableAsync())) {
    const { result } = await SMS.sendSMSAsync([way.to], words);
    return result !== 'cancelled';
  }
  await Linking.openURL(way.url);
  return true;
}
