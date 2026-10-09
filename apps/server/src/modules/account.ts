/**
 * Your data (docs/SECURITY.md): download everything Caime keeps about you (lib/export.ts), and
 * delete your account for good. Deleting removes the account row, and with it (through the schema's foreign
 * keys) sessions, relationships, rules, suggestions, notifications, connections and memberships.
 * Messages you sent stay in other people's conversations without your name; files you uploaded
 * that nobody else can see are removed from storage.
 */

import type { OkResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { endBillingOf } from '../lib/billing';
import { disconnect } from '../lib/checkout';
import { sendSystem } from '../lib/conversation-views';
import { handOverGroups } from '../lib/conversations';
import { verifyPassword } from '../lib/crypto';
import { rerootMerged } from '../lib/duplicates';
import { AppError, notFound } from '../lib/errors';
import { buildExport } from '../lib/export';
import { leaveAllGroupCalls } from '../lib/group-calls';
import { releaseHandle } from '../lib/handles';
import { participantsOf } from '../lib/messages';
import { revokeGrantsOf } from '../lib/oauth';
import { handOverOrgs } from '../lib/orgs';
import { handOverSpaces } from '../lib/spaces';
import { storageFor } from '../lib/storage';
import { endFollowsOf } from '../lib/updates';
import { parse } from '../lib/validate';
import { clearSessionCookie, requireAuth } from '../plugins/auth';

export async function accountRoutes(app: FastifyInstance, ctx: AppContext) {
  const storage = storageFor(ctx.config);

  app.get('/me/export', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`export:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const found = await ctx.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', me)
      .executeTakeFirst();
    if (!found) throw notFound(tr('Your account'));
    const now = ctx.now();
    const archive = await buildExport(ctx, me, now);
    await audit(ctx.db, { actorId: me, action: 'account.exported' });
    const date = now.toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="caime-export-${date}.json"`)
      .header('cache-control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(archive, null, 2));
  });

  app.delete('/me', async (req, reply): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { password } = parse(
      z.object({ password: z.string().min(1, 'Enter your password.').max(200) }),
      req.body,
    );
    ctx.limiter.hit(`delete:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'handle', 'password_hash'])
      .where('id', '=', me)
      .executeTakeFirst();
    if (!user) throw notFound(tr('Your account'));
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'invalid_credentials', tr('That password isn’t right.'));
    }
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
    clearSessionCookie(reply, ctx);
    return { ok: true };
  });
}
