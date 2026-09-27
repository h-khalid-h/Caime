/**
 * Conversations seen as private on this device (R18): once seen so, never written to in the
 * clear, nor read unsealed, whatever the server says of them later. Kept with the keys, and
 * forgotten with them when the account signs out here. Small, and without the crypto, so any
 * conversation can ask.
 */
import { useSession } from '@/state/session';
import { keystoreSupported, loadPrivate, savePrivate } from './keystore';

const known = new Map<string, boolean>();

export async function knownPrivate(conversationId: string): Promise<boolean> {
  const me = useSession.getState().user?.id;
  if (!me || !keystoreSupported) return false;
  const hit = known.get(`${me}|${conversationId}`);
  if (hit !== undefined) return hit;
  const seen = await loadPrivate(`${me}|${conversationId}`).catch(() => false);
  known.set(`${me}|${conversationId}`, seen);
  return seen;
}

export async function rememberPrivate(conversationId: string): Promise<void> {
  const me = useSession.getState().user?.id;
  if (!me || !keystoreSupported || known.get(`${me}|${conversationId}`)) return;
  known.set(`${me}|${conversationId}`, true);
  await savePrivate(`${me}|${conversationId}`).catch(() => {});
}

export function forgetKnown(): void {
  known.clear();
}
