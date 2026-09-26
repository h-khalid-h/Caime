/**
 * Relationships (PRD §5.3, §6–§14, §53, §62). Directional, owned by their definer, private
 * unless shared, and versioned: a change supersedes the old record instead of overwriting it
 * (PRD §13), so history is preserved.
 */

import type { RelationshipHistoryView, TaxonomyResponse } from '@caishy/core';
import {
  ChangeRelationshipBody,
  CreateRelationshipBody,
  CustomRoleBody,
  findRole,
  isSphere,
  MergeRelationshipsBody,
  primarySpheres,
  type RelationshipInputT,
  ROLES,
  rolesForPicker,
  SPHERE_DEFS,
  SPHERES,
  type Sphere,
  secondarySpheres,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Database, Relationship } from '../db/schema';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { between, mutualFit, pairKey, relationshipView } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

type Q = Kysely<Database> | Transaction<Database>;

function snapshot(
  r: Pick<
    Relationship,
    'sphere' | 'role' | 'role_label' | 'org_name' | 'context_note' | 'shared' | 'status'
  >,
) {
  return {
    sphere: r.sphere,
    role: r.role,
    roleLabel: r.role_label,
    orgName: r.org_name,
    contextNote: r.context_note,
    shared: r.shared,
    status: r.status,
  };
}

function validateRole(
  sphere: Sphere,
  role: string | null | undefined,
  roleLabel: string | null | undefined,
) {
  if (!isSphere(sphere)) throw badRequest('Unknown sphere.');
  if (role && !findRole(sphere, role))
    throw badRequest(
      `“${role}” isn’t a ${SPHERE_DEFS[sphere].label.toLowerCase()} role. Use a custom role instead.`,
    );
  if (role && roleLabel) throw badRequest('Choose a role or write your own, not both.');
}

/** May `owner` classify `subject`? Connected, requested either way, or sharing a conversation. */
async function mayClassify(db: Q, owner: string, subject: string): Promise<boolean> {
  const b = await between(db, owner, subject);
  if (b.blockedMe) return false;
  if (b.connected || b.outgoingRequestId || b.incomingRequestId) return true;
  const shared = await db
    .selectFrom('participants as a')
    .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
    .select('a.conversation_id')
    .where('a.user_id', '=', owner)
    .where('b.user_id', '=', subject)
    .limit(1)
    .executeTakeFirst();
  return Boolean(shared);
}

export async function createRelationship(
  db: Q,
  ctx: AppContext,
  ownerId: string,
  subjectId: string,
  input: RelationshipInputT,
  opts: {
    source: Relationship['source'];
    connectionId?: string | null;
    primary?: boolean;
    /** False when this row supersedes another: the caller records one "changed" event instead. */
    recordCreated?: boolean;
  } = {
    source: 'user',
  },
): Promise<Relationship> {
  validateRole(input.sphere, input.role, input.roleLabel);
  const active = await db
    .selectFrom('relationships')
    .select(['id', 'is_primary'])
    .where('owner_id', '=', ownerId)
    .where('subject_id', '=', subjectId)
    .where('status', '=', 'active')
    .execute();
  const makePrimary = opts.primary ?? !active.some((r) => r.is_primary);
  if (makePrimary && active.length) {
    await db
      .updateTable('relationships')
      .set({ is_primary: false })
      .where(
        'id',
        'in',
        active.map((r) => r.id),
      )
      .execute();
  }
  const connectionId =
    opts.connectionId ??
    (
      await db
        .selectFrom('connections')
        .select('id')
        .where('user_a', '=', pairKey(ownerId, subjectId).low)
        .where('user_b', '=', pairKey(ownerId, subjectId).high)
        .where('status', '=', 'active')
        .executeTakeFirst()
    )?.id ??
    null;
  const row = await db
    .insertInto('relationships')
    .values({
      id: uuidv7(),
      owner_id: ownerId,
      subject_id: subjectId,
      connection_id: connectionId,
      sphere: input.sphere,
      role: input.role ?? null,
      role_label: input.roleLabel ?? null,
      org_name: input.orgName ?? null,
      context_note: input.contextNote ?? null,
      shared: input.shared ?? false,
      is_primary: makePrimary,
      source: opts.source,
      started_at: ctx.now(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (opts.recordCreated !== false)
    await db
      .insertInto('relationship_events')
      .values({
        id: uuidv7(),
        relationship_id: row.id,
        owner_id: ownerId,
        kind: 'created',
        after: JSON.stringify(snapshot(row)),
        at: ctx.now(),
      })
      .execute();
  await recordEvent(db, 'relationship.assigned', ownerId, { relationshipId: row.id, subjectId });
  return row;
}

async function owned(db: Q, ownerId: string, id: string): Promise<Relationship> {
  const r = await db
    .selectFrom('relationships')
    .selectAll()
    .where('id', '=', id)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst();
  if (!r) throw notFound('That relationship');
  return r;
}

async function event(
  db: Q,
  ctx: AppContext,
  r: Relationship,
  kind: 'changed' | 'ended' | 'archived' | 'restored' | 'merged' | 'shared' | 'unshared',
  before: unknown,
  after: unknown,
) {
  await db
    .insertInto('relationship_events')
    .values({
      id: uuidv7(),
      relationship_id: r.id,
      owner_id: r.owner_id,
      kind,
      before: JSON.stringify(before),
      after: JSON.stringify(after),
      at: ctx.now(),
    })
    .execute();
}

export async function relationshipRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/relationships/taxonomy', async (req): Promise<TaxonomyResponse> => {
    const auth = requireAuth(req);
    const custom = await ctx.db
      .selectFrom('custom_roles')
      .select(['id', 'sphere', 'label'])
      .where('user_id', '=', auth.userId)
      .orderBy('label')
      .execute();
    const describe = (d: (typeof SPHERE_DEFS)[Sphere]) => {
      const picker = rolesForPicker(d.id);
      return {
        id: d.id,
        label: d.label,
        plural: d.plural,
        group: d.group,
        primary: d.primary,
        roleQuestion: d.roleQuestion,
        asksOrganization: d.asksOrganization,
        quickRoles: picker.quick.map((r) => ({ id: r.id, label: r.label })),
        moreRoles: picker.more.map((r) => ({
          id: r.id,
          label: r.label,
          gendered: r.gendered ?? false,
        })),
        customRoles: custom
          .filter((c) => c.sphere === d.id)
          .map((c) => ({ id: c.id, label: c.label })),
      };
    };
    return { primary: primarySpheres().map(describe), more: secondarySpheres().map(describe) };
  });

  app.post('/relationships/custom-roles', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CustomRoleBody, req.body);
    const id = uuidv7();
    await ctx.db
      .insertInto('custom_roles')
      .values({ id, user_id: auth.userId, sphere: body.sphere, label: body.label })
      .onConflict((oc) => oc.columns(['user_id', 'sphere', 'label']).doNothing())
      .execute();
    reply.status(201);
    return { ok: true };
  });

  app.post('/relationships', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateRelationshipBody, req.body);
    if (body.userId === auth.userId) throw badRequest('That’s you.');
    if (!(await mayClassify(ctx.db, auth.userId, body.userId)))
      throw forbidden('Connect with this person first.');
    const row = await ctx.db
      .transaction()
      .execute((trx) =>
        createRelationship(trx, ctx, auth.userId, body.userId, body, { source: 'user' }),
      );
    await ctx.bus.publish([auth.userId], {
      type: 'relationship.changed',
      data: { subjectId: body.userId },
    });
    reply.status(201);
    return { relationship: relationshipView(row) };
  });

  app.patch('/relationships/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ChangeRelationshipBody, req.body);
    const current = await owned(ctx.db, auth.userId, id);
    if (current.status !== 'active')
      throw badRequest('Restore this relationship before changing it.');
    const classificationChanged =
      (body.sphere !== undefined && body.sphere !== current.sphere) ||
      (body.role !== undefined && body.role !== current.role) ||
      (body.roleLabel !== undefined && body.roleLabel !== current.role_label) ||
      (body.orgName !== undefined && body.orgName !== current.org_name);
    const result = await ctx.db.transaction().execute(async (trx) => {
      if (!classificationChanged) {
        // Sharing and the context note are properties of the same relationship, not a new version.
        const next = await trx
          .updateTable('relationships')
          .set({
            ...(body.shared !== undefined ? { shared: body.shared } : {}),
            ...(body.contextNote !== undefined ? { context_note: body.contextNote } : {}),
            updated_at: ctx.now(),
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (body.shared !== undefined && body.shared !== current.shared) {
          await event(
            trx,
            ctx,
            next,
            body.shared ? 'shared' : 'unshared',
            snapshot(current),
            snapshot(next),
          );
        } else if (body.contextNote !== undefined) {
          await event(trx, ctx, next, 'changed', snapshot(current), snapshot(next));
        }
        return next;
      }
      const sphere = body.sphere ?? (current.sphere as Sphere);
      const input: RelationshipInputT = {
        sphere,
        role:
          body.role !== undefined
            ? body.role
            : body.sphere && body.sphere !== current.sphere
              ? null
              : current.role,
        roleLabel:
          body.roleLabel !== undefined
            ? body.roleLabel
            : body.sphere && body.sphere !== current.sphere
              ? null
              : current.role_label,
        orgName: body.orgName !== undefined ? body.orgName : current.org_name,
        contextNote: body.contextNote !== undefined ? body.contextNote : current.context_note,
        shared: body.shared ?? current.shared,
      };
      validateRole(input.sphere, input.role, input.roleLabel);
      await trx
        .updateTable('relationships')
        .set({
          status: 'superseded',
          is_primary: false,
          ended_at: ctx.now(),
          updated_at: ctx.now(),
        })
        .where('id', '=', id)
        .execute();
      const next = await createRelationship(trx, ctx, auth.userId, current.subject_id, input, {
        source: current.source,
        connectionId: current.connection_id,
        primary: current.is_primary,
        recordCreated: false,
      });
      await trx
        .updateTable('relationships')
        .set({ superseded_by: next.id })
        .where('id', '=', id)
        .execute();
      await event(trx, ctx, next, 'changed', snapshot(current), snapshot(next));
      await recordEvent(trx, 'relationship.changed', auth.userId, {
        from: id,
        to: next.id,
        subjectId: current.subject_id,
      });
      return next;
    });
    await ctx.bus.publish([auth.userId], {
      type: 'relationship.changed',
      data: { subjectId: current.subject_id },
    });
    if (body.shared !== undefined) {
      // The other side can now see (or no longer sees) this classification.
      await ctx.bus.publish([current.subject_id], {
        type: 'relationship.shared',
        data: { ownerId: auth.userId },
      });
    }
    return { relationship: relationshipView(result) };
  });

  const transition = (
    path: string,
    from: Relationship['status'][],
    to: Relationship['status'],
    kind: 'ended' | 'archived' | 'restored',
  ) =>
    app.post(`/relationships/:id/${path}`, async (req) => {
      const auth = requireAuth(req);
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const current = await owned(ctx.db, auth.userId, id);
      if (!from.includes(current.status))
        throw badRequest(`This relationship is ${current.status}.`);
      if (
        kind === 'ended' &&
        current.role &&
        findRole(current.sphere as Sphere, current.role)?.endable === false
      ) {
        throw badRequest('This kind of relationship doesn’t end. Archive it instead.');
      }
      const next = await ctx.db.transaction().execute(async (trx) => {
        // A restored relationship becomes the main one again unless another already is.
        const otherPrimary =
          to === 'active'
            ? await trx
                .selectFrom('relationships')
                .select('id')
                .where('owner_id', '=', auth.userId)
                .where('subject_id', '=', current.subject_id)
                .where('status', '=', 'active')
                .where('is_primary', '=', true)
                .where('id', '<>', id)
                .executeTakeFirst()
            : undefined;
        const row = await trx
          .updateTable('relationships')
          .set({
            status: to,
            ended_at: to === 'active' ? null : (current.ended_at ?? ctx.now()),
            is_primary: to === 'active' ? !otherPrimary : false,
            updated_at: ctx.now(),
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await event(trx, ctx, row, kind, snapshot(current), snapshot(row));
        return row;
      });
      await ctx.bus.publish([auth.userId], {
        type: 'relationship.changed',
        data: { subjectId: current.subject_id },
      });
      return { relationship: relationshipView(next) };
    });
  transition('end', ['active'], 'ended', 'ended');
  transition('archive', ['active', 'ended'], 'archived', 'archived');
  transition('restore', ['ended', 'archived'], 'active', 'restored');

  app.post('/relationships/:id/primary', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const current = await owned(ctx.db, auth.userId, id);
    if (current.status !== 'active')
      throw badRequest('Only an active relationship can be the main one.');
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('relationships')
        .set({ is_primary: false })
        .where('owner_id', '=', auth.userId)
        .where('subject_id', '=', current.subject_id)
        .execute();
      await trx
        .updateTable('relationships')
        .set({ is_primary: true })
        .where('id', '=', id)
        .execute();
    });
    return { ok: true };
  });

  app.post('/relationships/merge', async (req) => {
    const auth = requireAuth(req);
    const body = parse(MergeRelationshipsBody, req.body);
    const keep = await owned(ctx.db, auth.userId, body.keepId);
    const merge = await ctx.db
      .selectFrom('relationships')
      .selectAll()
      .where('id', 'in', body.mergeIds)
      .where('owner_id', '=', auth.userId)
      .where('subject_id', '=', keep.subject_id)
      .execute();
    if (merge.length !== body.mergeIds.length)
      throw badRequest('Merge relationships with the same person.');
    await ctx.db.transaction().execute(async (trx) => {
      for (const m of merge) {
        await trx
          .updateTable('relationships')
          .set({
            status: 'merged',
            superseded_by: keep.id,
            is_primary: false,
            updated_at: ctx.now(),
          })
          .where('id', '=', m.id)
          .execute();
        await event(trx, ctx, m, 'merged', snapshot(m), { into: keep.id });
      }
    });
    return { relationship: relationshipView(keep) };
  });

  app.get('/people/:id/relationships', async (req): Promise<RelationshipHistoryView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const rows = await ctx.db
      .selectFrom('relationships')
      .selectAll()
      .where('owner_id', '=', auth.userId)
      .where('subject_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();
    const events = rows.length
      ? await ctx.db
          .selectFrom('relationship_events')
          .selectAll()
          .where(
            'relationship_id',
            'in',
            rows.map((r) => r.id),
          )
          .orderBy('at', 'asc')
          .orderBy('id', 'asc')
          .execute()
      : [];
    const primary = rows.find((r) => r.status === 'active' && r.is_primary);
    return {
      current: rows.filter((r) => r.status === 'active').map(relationshipView),
      history: rows.map(relationshipView),
      events: events.map((e) => ({
        id: e.id,
        relationshipId: e.relationship_id,
        kind: e.kind,
        before: e.before,
        after: e.after,
        at: e.at.toISOString(),
      })),
      mutual: primary ? await mutualFit(ctx.db, auth.userId, id, primary) : null,
    };
  });

  // Keep the list of spheres and roles addressable for clients that cache the taxonomy.
  app.get('/relationships/spheres', async () => ({
    spheres: SPHERES.map((s) => ({
      id: s,
      label: SPHERE_DEFS[s].label,
      roles: ROLES[s].map((r) => ({ id: r.id, label: r.label })),
    })),
  }));
}
