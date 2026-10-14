/**
 * The phone's own address book (R89), through expo-contacts: asked for once, read here, and
 * never sent anywhere but its addresses. On iOS 18 someone may share only some contacts; then
 * they're offered to share more through the system's own picker. The web's is local.web.ts.
 */
import { fromDevice, type RawContact } from '@caime/core/contact-sources';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

export type LocalSource = 'device' | 'picker';
export type LocalRead =
  | { status: 'read'; raws: RawContact[]; limited: boolean }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'cancelled' };

/** What this platform reads people from on the device itself. */
export const localSource: LocalSource | null = 'device';

const FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.EMAILS,
  ContactField.PHONES,
] as const;

export async function readLocal(): Promise<LocalRead> {
  const asked = await requestPermissionsAsync();
  if (!asked.granted) return { status: 'denied', canAskAgain: asked.canAskAgain };
  const raws = fromDevice(await Contact.getAllDetails(FIELDS));
  return { status: 'read', raws, limited: asked.accessPrivileges === 'limited' };
}

/** Whether the person can share more of their contacts than they did (iOS 18's limited access). */
export const canShareMore = Platform.OS === 'ios';

/** The system's picker for sharing more, then everything now shared, read again. */
export async function shareMore(): Promise<LocalRead> {
  await Contact.presentAccessPicker();
  return readLocal();
}
