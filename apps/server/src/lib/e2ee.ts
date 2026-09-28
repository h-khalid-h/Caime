/**
 * Private conversations (R18, PRD §61), on the server: the devices' public keys it hands out,
 * with the introductions that vouch for them, and the check that a message arrives sealed for
 * everyone who should read it. The server never holds a private key or a message's text; what it
 * keeps of a private message is its envelope. Nothing here is trusted by the devices: each checks
 * every introduction itself (packages/core/src/e2ee.ts), so this only has to be right for them to
 * work, never for them to be safe.
 */
import type { DeviceView, PublicJwk, SealedMessage } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { AppError } from './errors';

export { MAX_DEVICES } from '@caime/core';

interface Row {
  id: string;
  user_id: string;
  encryption_key: unknown;
  signing_key: unknown;
  introduced_by: string | null;
  introduction: string;
}

/** A device as anyone writing to it gets it: its keys and who vouched for it, nothing else. */
export const deviceView = (r: Row): DeviceView => ({
  id: r.id,
  userId: r.user_id,
  encryptionKey: r.encryption_key as PublicJwk,
  signingKey: r.signing_key as PublicJwk,
  introducedBy: r.introduced_by,
  introduction: r.introduction,
});

/** Only what anyone writing to it gets of a device, from one with more on it. */
export const publicView = (d: DeviceView): DeviceView => ({
  id: d.id,
  userId: d.userId,
  encryptionKey: d.encryptionKey,
  signingKey: d.signingKey,
  introducedBy: d.introducedBy,
  introduction: d.introduction,
});

export interface LiveDevice extends DeviceView {
  sessionId: string;
  name: string | null;
  createdAt: string;
  approved: boolean;
}

/**
 * The devices that read private conversations now: approved (or the first of their person's
 * chain), not removed, and signed in with a session that's still live (signing out, or being
 * signed out, ends the device too). With `waiting`, also those still waiting to be approved: only
 * ever for their own person.
 */
export async function liveDevicesOf(
  ctx: Pick<AppContext, 'db' | 'now'>,
  userIds: string[],
  opts: { waiting?: boolean } = {},
): Promise<LiveDevice[]> {
  if (!userIds.length) return [];
  const rows = await ctx.db
    .selectFrom('e2ee_devices as d')
    .innerJoin('sessions as s', 's.id', 'd.session_id')
    .select([
      'd.id',
      'd.user_id',
      's.id as session_id',
      'd.name',
      'd.encryption_key',
      'd.signing_key',
      'd.introduced_by',
      'd.introduction',
      'd.approved_at',
      'd.created_at',
    ])
    .where('d.user_id', 'in', userIds)
    .where('d.revoked_at', 'is', null)
    .where('s.revoked_at', 'is', null)
    .where('s.expires_at', '>', ctx.now())
    .$if(!opts.waiting, (q) => q.where('d.approved_at', 'is not', null))
    .orderBy('d.created_at')
    .orderBy('d.id')
    .execute();
  return rows.map((r) => ({
    ...deviceView(r),
    sessionId: r.session_id,
    name: r.name,
    createdAt: r.created_at.toISOString(),
    approved: r.approved_at !== null,
  }));
}

/**
 * These devices and every device up their chains of introductions (approved ever, removed or
 * not), for a device to check them with: only of these people.
 */
export async function chainOf(
  ctx: Pick<AppContext, 'db'>,
  ids: string[],
  userIds: string[],
): Promise<DeviceView[]> {
  if (!ids.length || !userIds.length) return [];
  const rows = await sql<Row>`
    with recursive chain as (
      select id, user_id, encryption_key, signing_key, introduced_by, introduction, 0 as depth
        from e2ee_devices
        where id = any(${ids}::uuid[]) and user_id = any(${userIds}::uuid[])
          and approved_at is not null
      union
      select d.id, d.user_id, d.encryption_key, d.signing_key, d.introduced_by, d.introduction,
          c.depth + 1
        from e2ee_devices d join chain c on d.id = c.introduced_by
        where d.user_id = c.user_id and c.depth < 500
    )
    select distinct on (id) id, user_id, encryption_key, signing_key, introduced_by, introduction
      from chain`.execute(ctx.db);
  return rows.rows.map(deviceView);
}

/**
 * A private message is taken only from one of its sender's own devices, and only sealed for
 * every device of everyone in the conversation now. Otherwise the sender's device is told which
 * devices there are (and what vouches for them), and seals it again: nobody in it is left out
 * without anyone knowing.
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
  if (sealed.by !== senderId || !devices.some((d) => d.id === sealed.from && d.userId === senderId))
    throw new AppError(
      403,
      'unknown_device',
      'This device isn’t set up for private conversations: sign in again to write here.',
    );
  if (devices.some((d) => !sealed.keys[d.id]))
    throw new AppError(409, 'devices_changed', 'Someone’s devices changed since this was sealed.', {
      people,
      devices: devices.map(publicView),
      chain: await chainOf(
        ctx,
        devices.map((d) => d.id),
        people,
      ),
    });
}
