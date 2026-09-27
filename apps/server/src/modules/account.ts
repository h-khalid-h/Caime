/**
 * Your data (docs/SECURITY.md): download everything Caishy holds about you, and delete your
 * account for good. Deleting removes the account row, and with it (through the schema's foreign
 * keys) sessions, relationships, rules, suggestions, notifications, connections and memberships.
 * Messages you sent stay in other people's conversations without your name; files you uploaded
 * that nobody else can see are removed from storage.
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { endBillingOf } from '../lib/billing';
import { verifyPassword } from '../lib/crypto';
import { rerootMerged } from '../lib/duplicates';
import { AppError, notFound } from '../lib/errors';
import { leaveAllGroupCalls } from '../lib/group-calls';
import { handOverOrgs } from '../lib/orgs';
import { relationshipView } from '../lib/relations';
import { handOverSpaces } from '../lib/spaces';
import { diskStorage } from '../lib/storage';
import { meView } from '../lib/users';
import { parse } from '../lib/validate';
import { clearSessionCookie, requireAuth } from '../plugins/auth';

export async function accountRoutes(app: FastifyInstance, ctx: AppContext) {
  const storage = diskStorage(ctx.config.DATA_DIR);

  app.get('/me/export', async (req, reply) => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`export:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', me)
      .executeTakeFirst();
    if (!user) throw notFound('Your account');
    const now = ctx.now();
    const [
      identities,
      relationships,
      events,
      policies,
      connections,
      conversations,
      messages,
      tasks,
      files,
      sessions,
      aiRuns,
      spaces,
      orgs,
      tokens,
      apps,
      connectedApps,
      following,
    ] = await Promise.all([
      ctx.db.selectFrom('identities').selectAll().where('user_id', '=', me).execute(),
      ctx.db
        .selectFrom('relationships as r')
        .innerJoin('users as u', 'u.id', 'r.subject_id')
        .selectAll('r')
        .select(['u.display_name as subject_name', 'u.handle as subject_handle'])
        .where('r.owner_id', '=', me)
        .execute(),
      ctx.db
        .selectFrom('relationship_events')
        .selectAll()
        .where('owner_id', '=', me)
        .orderBy('at')
        .execute(),
      ctx.db.selectFrom('relationship_policies').selectAll().where('user_id', '=', me).execute(),
      ctx.db
        .selectFrom('connection_sides as s')
        .innerJoin('users as u', 'u.id', 's.other_id')
        .select(['u.display_name', 'u.handle', 's.nickname', 's.connection_id'])
        .where('s.owner_id', '=', me)
        .execute(),
      ctx.db
        .selectFrom('participants as p')
        .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
        .select(['c.id', 'c.kind', 'c.title', 'c.created_at', 'p.joined_at', 'p.left_at'])
        .where('p.user_id', '=', me)
        .execute(),
      ctx.db
        .selectFrom('messages')
        .select([
          'id',
          'conversation_id',
          'kind',
          'body',
          'payload',
          'created_at',
          'edited_at',
          'deleted_at',
        ])
        .where('sender_id', '=', me)
        .orderBy('created_at')
        .execute(),
      ctx.db.selectFrom('tasks').selectAll().where('owner_id', '=', me).execute(),
      ctx.db
        .selectFrom('files')
        .select(['id', 'name', 'mime', 'size', 'kind', 'created_at'])
        .where('owner_id', '=', me)
        .execute(),
      ctx.db
        .selectFrom('sessions')
        .select(['kind', 'device_name', 'platform', 'created_at', 'last_seen_at'])
        .where('user_id', '=', me)
        .where('revoked_at', 'is', null)
        .execute(),
      ctx.db
        .selectFrom('ai_runs')
        .select(['feature', 'model', 'outcome', 'created_at'])
        .where('user_id', '=', me)
        .orderBy('created_at')
        .execute(),
      ctx.db
        .selectFrom('space_members as m')
        .innerJoin('spaces as s', 's.id', 'm.space_id')
        .select(['s.name', 's.kind', 'm.role', 'm.joined_at', 'm.left_at'])
        .where('m.user_id', '=', me)
        .orderBy('m.joined_at')
        .execute(),
      ctx.db
        .selectFrom('org_members as m')
        .innerJoin('organizations as o', 'o.id', 'm.org_id')
        .select(['o.name', 'o.handle', 'm.role', 'm.title', 'm.joined_at', 'm.left_at'])
        .where('m.user_id', '=', me)
        .orderBy('m.joined_at')
        .execute(),
      // What can act as you, and what you made for others: names and permissions, never secrets.
      ctx.db
        .selectFrom('personal_tokens')
        .select(['name', 'scopes', 'created_at', 'last_used_at', 'expires_at'])
        .where('user_id', '=', me)
        .where('revoked_at', 'is', null)
        .orderBy('created_at')
        .execute(),
      ctx.db
        .selectFrom('oauth_clients')
        .select(['client_id', 'name', 'website', 'redirect_uris', 'secret_hash', 'created_at'])
        .where('owner_id', '=', me)
        .where('revoked_at', 'is', null)
        .orderBy('created_at')
        .execute(),
      ctx.db
        .selectFrom('oauth_grants as g')
        .innerJoin('oauth_clients as c', 'c.id', 'g.client_id')
        .select(['c.name', 'c.website', 'g.scopes', 'g.created_at', 'g.last_used_at'])
        .where('g.user_id', '=', me)
        .where('g.revoked_at', 'is', null)
        .where('c.revoked_at', 'is', null)
        .orderBy('g.created_at')
        .execute(),
      ctx.db
        .selectFrom('org_follows as f')
        .innerJoin('organizations as o', 'o.id', 'f.org_id')
        .select(['o.name', 'o.handle', 'f.notify', 'f.created_at'])
        .where('f.user_id', '=', me)
        .orderBy('f.created_at')
        .execute(),
    ]);
    await audit(ctx.db, { actorId: me, action: 'account.exported' });
    const archive = {
      format: 'caishy-export/1',
      exportedAt: now.toISOString(),
      note: 'Everything Caishy holds that is yours. Messages are the ones you sent; files are listed, and each downloads from its link while you are signed in.',
      account: meView(user, now),
      identities: identities.map((i) => ({
        kind: i.kind,
        displayName: i.display_name,
        headline: i.headline,
        orgName: i.org_name,
        isDefault: i.is_default,
      })),
      relationships: relationships.map((r) => ({
        person: { displayName: r.subject_name, handle: r.subject_handle },
        ...relationshipView(r),
      })),
      relationshipHistory: events.map((e) => ({
        kind: e.kind,
        before: e.before,
        after: e.after,
        at: e.at.toISOString(),
      })),
      notificationRules: policies.map((p) => ({
        name: p.name,
        scope: { sphere: p.scope_sphere, role: p.scope_role },
        settings: p.settings,
      })),
      connections: connections.map((c) => ({
        displayName: c.display_name,
        handle: c.handle,
        nickname: c.nickname,
      })),
      conversations: conversations.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
        joinedAt: c.joined_at?.toISOString() ?? null,
        leftAt: c.left_at?.toISOString() ?? null,
      })),
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        kind: m.kind,
        body: m.deleted_at ? null : m.body,
        payload: m.deleted_at ? null : m.payload,
        sentAt: m.created_at.toISOString(),
        editedAt: m.edited_at?.toISOString() ?? null,
        deletedAt: m.deleted_at?.toISOString() ?? null,
      })),
      actions: tasks.map((t) => ({
        title: t.title,
        notes: t.notes,
        status: t.status,
        dueAt: t.due_at?.toISOString() ?? null,
        createdAt: t.created_at.toISOString(),
      })),
      files: files.map((f) => ({
        name: f.name,
        mime: f.mime,
        size: Number(f.size),
        kind: f.kind,
        uploadedAt: f.created_at.toISOString(),
        url: `/v1/files/${f.id}`,
      })),
      devices: sessions.map((s) => ({
        kind: s.kind,
        deviceName: s.device_name,
        platform: s.platform,
        signedInAt: s.created_at.toISOString(),
        lastSeenAt: s.last_seen_at.toISOString(),
      })),
      spaces: spaces.map((sp) => ({
        name: sp.name,
        kind: sp.kind,
        role: sp.role,
        joinedAt: sp.joined_at.toISOString(),
        leftAt: sp.left_at?.toISOString() ?? null,
      })),
      organizations: orgs.map((o) => ({
        name: o.name,
        handle: o.handle,
        role: o.role,
        title: o.title,
        joinedAt: o.joined_at.toISOString(),
        leftAt: o.left_at?.toISOString() ?? null,
      })),
      following: following.map((f) => ({
        organization: { name: f.name, handle: f.handle },
        notify: f.notify,
        since: f.created_at.toISOString(),
      })),
      accessTokens: tokens.map((k) => ({
        name: k.name,
        scopes: k.scopes,
        createdAt: k.created_at.toISOString(),
        lastUsedAt: k.last_used_at?.toISOString() ?? null,
        expiresAt: k.expires_at?.toISOString() ?? null,
      })),
      appsYouMade: apps.map((a) => ({
        clientId: a.client_id,
        name: a.name,
        website: a.website,
        redirectUris: a.redirect_uris,
        confidential: a.secret_hash !== null,
        createdAt: a.created_at.toISOString(),
      })),
      connectedApps: connectedApps.map((g) => ({
        name: g.name,
        website: g.website,
        scopes: g.scopes,
        allowedAt: g.created_at.toISOString(),
        lastUsedAt: g.last_used_at?.toISOString() ?? null,
      })),
      // When AI assist was used and for what; what it read and wrote is never stored.
      aiAssist: aiRuns.map((r) => ({
        feature: r.feature,
        model: r.model,
        outcome: r.outcome,
        at: r.created_at.toISOString(),
      })),
    };
    const date = now.toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="caishy-export-${date}.json"`)
      .header('cache-control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(archive, null, 2));
  });

  app.delete('/me', async (req, reply) => {
    const auth = requireAuth(req);
    const { password } = parse(
      z.object({ password: z.string().min(1, 'Enter your password.').max(200) }),
      req.body,
    );
    ctx.limiter.hit(`delete:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('id', '=', me)
      .executeTakeFirst();
    if (!user) throw notFound('Your account');
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'invalid_credentials', 'That password isn’t right.');
    }
    // Who to tell, and which files only this account could see (in no message and no album).
    const [others, orphanFiles] = await Promise.all([
      ctx.db.selectFrom('connection_sides').select('other_id').where('owner_id', '=', me).execute(),
      ctx.db
        .selectFrom('files as f')
        .select(['f.id', 'f.storage_key', 'f.thumb_key'])
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
    // Its devices read nothing more, but their public keys stay (without their names), so those
    // it wrote to privately can still check what it sent them.
    await ctx.db
      .updateTable('e2ee_devices')
      .set({ name: null, revoked_at: sql`coalesce(revoked_at, ${ctx.now()})` })
      .where('user_id', '=', me)
      .execute();
    const closed = await ctx.db.transaction().execute(async (trx) => {
      // Spaces and organizations it owned stay with the people in them.
      await handOverSpaces(trx, me, ctx.now());
      const closedOrgs = await handOverOrgs(trx, me, ctx.now());
      // Anyone who merged others under this account still sees them as one person.
      await rerootMerged(trx, me);
      // The account first (its avatar points at a file), then the files only it could see.
      await trx.deleteFrom('users').where('id', '=', me).execute();
      if (orphanFiles.length)
        await trx
          .deleteFrom('files')
          .where(
            'id',
            'in',
            orphanFiles.map((f) => f.id),
          )
          .execute();
      return closedOrgs;
    });
    // An organization that closed with it pays for nothing any more.
    for (const orgId of closed) await endBillingOf(ctx, { orgId });
    await audit(ctx.db, { actorId: null, action: 'account.deleted', target: me });
    for (const f of orphanFiles) {
      await storage.remove(f.storage_key).catch(() => {});
      if (f.thumb_key) await storage.remove(f.thumb_key).catch(() => {});
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
