/**
 * An account deleted for good (docs/SECURITY.md): its owner's own request (`DELETE /me`), and a
 * child's account whose parent withdrew their consent, said it wasn't their child's or never
 * agreed (R122). The account row goes, and with it (through the schema's foreign keys) sessions,
 * relationships, rules, suggestions, notifications, connections and memberships; messages it sent
 * stay in other people's conversations without its name; files it uploaded that nobody else can
 * see are removed from storage. Anything new that deletes an account goes through here.
 */
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { builtinCountsChanged } from './app-directory';
import { audit } from './audit';
import { endBillingOf } from './billing';
import { disconnect } from './checkout';
import { disconnectAllAccounts } from './connected-accounts';
import { sendSystem } from './conversation-views';
import { handOverGroups } from './conversations';
import { rerootMerged } from './duplicates';
import { leaveAllGroupCalls } from './group-calls';
import { releaseHandle } from './handles';
import { participantsOf } from './messages';
import { revokeGrantsOf } from './oauth';
import { handOverOrgs } from './orgs';
import { handOverSpaces } from './spaces';
import { storageFor } from './storage';
import { endFollowsOf } from './updates';

export async function deleteAccount(ctx: AppContext, me: string): Promise<void> {
  const storage = storageFor(ctx.config);
  const user = await ctx.db
    .selectFrom('users')
    .select(['id', 'handle'])
    .where('id', '=', me)
    .executeTakeFirst();
  if (!user) return;
  // Who to tell, and which files only this account could see (in no message and no album).
  const [others, orphanFiles] = await Promise.all([
    ctx.db.selectFrom('connection_sides').select('other_id').where('owner_id', '=', me).execute(),
    ctx.db
      .selectFrom('files as f')
      .select(['f.id', 'f.storage_key', 'f.thumb_key', 'f.preview_key'])
      .where('f.owner_id', '=', me)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('message_files as mf')
              .select('mf.file_id')
              .whereRef('mf.file_id', '=', 'f.id'),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('album_photos as ap')
              .select('ap.file_id')
              .whereRef('ap.file_id', '=', 'f.id'),
          ),
        ),
      )
      // An organization's logo, its catalog's photos and an app's icon stay with what they
      // belong to (an organization handed on, an app that lives on under its organization).
      .where(sql<boolean>`not exists (select 1 from organizations o where o.avatar_file_id = f.id)`)
      .where(
        sql<boolean>`not exists (select 1 from organizations o, jsonb_array_elements(o.booking_items) i where i->>'photoFileId' = f.id::text)`,
      )
      .where(sql<boolean>`not exists (select 1 from oauth_clients a where a.icon_file_id = f.id)`)
      .execute(),
  ]);
  // What it pays for ends first: nothing is charged to an account that's gone (Stripe away for
  // a moment, a job keeps trying; deleting never waits on it).
  await endBillingOf(ctx, { userId: me });
  // Out of any group call, so the others hear it and the call's line is written.
  await leaveAllGroupCalls(ctx, me);
  // Every app it let in is let go of, so each counts one fewer connected (R74): the rows
  // would go with the account, but not the counts Discover is ordered by.
  await revokeGrantsOf(ctx, me);
  // Its Google and Microsoft accounts are let go of, revoked where the provider can (R90).
  await disconnectAllAccounts(ctx, me);
  // Its devices read nothing more, but their public keys stay (without their names), so those
  // it wrote to privately can still check what it sent them.
  await ctx.db
    .updateTable('e2ee_devices')
    .set({ name: null, revoked_at: sql`coalesce(revoked_at, ${ctx.now()})` })
    .where('user_id', '=', me)
    .execute();
  const { closed, handed } = await ctx.db.transaction().execute(async (trx) => {
    // Spaces, groups and organizations it owned stay with the people in them.
    await handOverSpaces(trx, me, ctx.now());
    const handed = await handOverGroups(trx, me, {}, ctx.now());
    const closedOrgs = await handOverOrgs(trx, me, ctx.now());
    // Anyone who merged others under this account still sees them as one person.
    await rerootMerged(trx, me);
    // The account first (its avatar points at a file), then the files only it could see.
    await trx.deleteFrom('users').where('id', '=', me).execute();
    // Their calendar feed went with them: Discover's count of who has it on changes.
    builtinCountsChanged(ctx);
    // Its handle is held from everyone, so links to it never open someone else: the handle and
    // the days are all that's kept, never whose it was (lib/handles.ts).
    await releaseHandle(trx, user.handle, ctx.now());
    if (orphanFiles.length)
      await trx
        .deleteFrom('files')
        .where(
          'id',
          'in',
          orphanFiles.map((f) => f.id),
        )
        .execute();
    return { closed: closedOrgs, handed };
  });
  // Each group it owned says who runs it now, and everyone in it sees it at once.
  for (const { conversationId, heir } of handed) {
    if (heir) await sendSystem(ctx, conversationId, heir, 'owner_changed', { userId: heir });
    await ctx.bus.publish(
      (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
      { type: 'conversation.updated', data: { conversationId } },
    );
  }
  // An organization that closed with it pays for nothing any more, and nobody follows it.
  for (const orgId of closed) {
    await endBillingOf(ctx, { orgId });
    await endFollowsOf(ctx, orgId);
    await disconnect(ctx, orgId);
  }
  await audit(ctx.db, { actorId: null, action: 'account.deleted', target: me });
  // A file that stays behind is said so in the log, never silently kept.
  const dropped = (key: string) => (err: unknown) =>
    ctx.log.warn({ err, key }, 'account deletion: a file was not removed');
  for (const f of orphanFiles) {
    await storage.remove(f.storage_key).catch(dropped(f.storage_key));
    if (f.thumb_key) await storage.remove(f.thumb_key).catch(dropped(f.thumb_key));
    // Every rendition goes with it (R70); a small image's preview is its thumbnail.
    if (f.preview_key && f.preview_key !== f.thumb_key)
      await storage.remove(f.preview_key).catch(dropped(f.preview_key));
  }
  if (others.length)
    await ctx.bus.publish(
      others.map((o) => o.other_id),
      { type: 'connection.removed', data: { userId: me } },
    );
}
