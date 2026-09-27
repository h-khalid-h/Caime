/**
 * Private conversations (R18, PRD §61), on the server: the devices' public keys it hands out,
 * and the check that a message arrives sealed for everyone who should read it. The server never
 * holds a private key or a message's text; what it keeps of a private message is its envelope.
 */
import type { DeviceView, PublicJwk, SealedMessage } from '@caishy/core';
import type { AppContext } from '../context';
import { AppError } from './errors';

/** At most this many devices read one person's private conversations. */
export const MAX_DEVICES = 20;

/**
 * The devices that read private conversations now: registered, not removed, and signed in with
 * a session that's still live (signing out, or being signed out, ends the device too).
 */
export async function liveDevicesOf(
  ctx: Pick<AppContext, 'db' | 'now'>,
  userIds: string[],
): Promise<Array<DeviceView & { sessionId: string; name: string | null }>> {
  if (!userIds.length) return [];
  const rows = await ctx.db
    .selectFrom('e2ee_devices as d')
    .innerJoin('sessions as s', 's.id', 'd.session_id')
    .select([
      'd.id',
      'd.user_id',
      'd.session_id',
      'd.name',
      'd.encryption_key',
      'd.signing_key',
      'd.created_at',
    ])
    .where('d.user_id', 'in', userIds)
    .where('d.revoked_at', 'is', null)
    .where('s.revoked_at', 'is', null)
    .where('s.expires_at', '>', ctx.now())
    .orderBy('d.created_at')
    .orderBy('d.id')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    sessionId: r.session_id,
    name: r.name,
    encryptionKey: r.encryption_key as PublicJwk,
    signingKey: r.signing_key as PublicJwk,
    createdAt: r.created_at.toISOString(),
  }));
}

/** A device as anyone writing to it gets it: no session, no name. */
export const deviceView = (d: DeviceView): DeviceView => ({
  id: d.id,
  userId: d.userId,
  encryptionKey: d.encryptionKey,
  signingKey: d.signingKey,
  createdAt: d.createdAt,
});

/**
 * A private message is taken only from one of its sender's own devices, and only sealed for
 * every device of everyone in the conversation now. Otherwise the sender's device is told which
 * devices there are, and seals it again: nobody in it is left out without anyone knowing.
 */
export async function assertSealedForEveryone(
  ctx: AppContext,
  conversationId: string,
  senderId: string,
  sealed: SealedMessage,
): Promise<void> {
  const people = (
    await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('left_at', 'is', null)
      .execute()
  ).map((p) => p.user_id);
  const devices = await liveDevicesOf(ctx, people);
  if (!devices.some((d) => d.id === sealed.from && d.userId === senderId))
    throw new AppError(
      403,
      'unknown_device',
      'This device isn’t set up for private conversations: sign in again to write here.',
    );
  if (devices.some((d) => !sealed.keys[d.id]))
    throw new AppError(409, 'devices_changed', 'Someone’s devices changed since this was sealed.', {
      devices: devices.map(deviceView),
    });
}
