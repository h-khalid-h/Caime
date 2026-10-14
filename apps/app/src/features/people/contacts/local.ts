/**
 * Contacts on the device, on the web (R89): the browser's own contact picker where it has one
 * (Chrome on Android), whose people the person chooses; elsewhere nothing, and a file or an
 * account is offered instead. The phones' is local.native.ts.
 */
import { fromPicked, type RawContact } from '@caime/core/contact-sources';

export type LocalSource = 'device' | 'picker';
export type LocalRead =
  | { status: 'read'; raws: RawContact[]; limited: boolean }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'cancelled' };

interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<Array<{ name?: string[]; email?: string[]; tel?: string[] }>>;
  getProperties?: () => Promise<string[]>;
}

const picker = (): ContactsManager | null =>
  typeof navigator !== 'undefined' && 'contacts' in navigator
    ? ((navigator as Navigator & { contacts?: ContactsManager }).contacts ?? null)
    : null;

/** What this browser reads people from on the device itself: its picker, or nothing. */
export const localSource: LocalSource | null = picker() ? 'picker' : null;

export async function readLocal(): Promise<LocalRead> {
  const contacts = picker();
  if (!contacts) return { status: 'cancelled' };
  const offered = (await contacts.getProperties?.().catch(() => null)) ?? ['name', 'email', 'tel'];
  const wanted = ['name', 'email', 'tel'].filter((p) => offered.includes(p));
  try {
    const picked = await contacts.select(wanted, { multiple: true });
    if (!picked.length) return { status: 'cancelled' };
    // What was chosen is what was shared: nothing more to ask for.
    return { status: 'read', raws: fromPicked(picked), limited: false };
  } catch (e) {
    // Closed without choosing, or the browser said no (not from a tap): nothing read.
    return (e as Error).name === 'SecurityError'
      ? { status: 'denied', canAskAgain: true }
      : { status: 'cancelled' };
  }
}

export const canShareMore = false;

export async function shareMore(): Promise<LocalRead> {
  return readLocal();
}
