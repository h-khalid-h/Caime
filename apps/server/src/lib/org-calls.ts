/**
 * A customer calls an organization (M16 H8a, R111 (a)). Where its owner or an admin says its
 * customers may (`organizations.calls_from`), the customer of a business thread calls from it, and
 * the call rings the thread's team (`call_team_rings`, the human team members in it who aren't on
 * another call); whoever answers first takes it and becomes the call's callee. A ring turned down
 * is that person's alone, and all of them turned down ends it. The customer sees the
 * organization, never who answered (R15): `orgSide` is what they see on the other side, in a
 * call's view and in their history.
 */
import { CALL_RING_SECONDS, type CallKind, minorMayWriteToOrg, tr, uuidv7 } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { assertCanWrite } from './blocks';
import { CALL_SEEN_MS, liveCallOf, lockCallEntry } from './calls';
import { AppError, badRequest, forbidden } from './errors';
import { joinedGroupCallOf } from './group-calls';
import { minorOf } from './users';

/** Who a customer's call to the organization in this conversation rings, or why it can't. */
export async function orgCallTarget(
  ctx: AppContext,
  conversationId: string,
  userId: string,
): Promise<{ orgId: string; orgName: string; team: string[] }> {
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select([
      't.customer_id',
      'o.id as org_id',
      'o.name',
      'o.calls_from',
      'o.archived_at',
      'o.suspended_at',
      'o.verified_at',
    ])
    .where('t.conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!thread) throw badRequest(tr('There’s nobody to call here.'));
  if (thread.customer_id !== userId)
    throw badRequest(tr('Only the customer calls in a conversation with an organization.'));
  if (thread.archived_at)
    throw new AppError(409, 'org_closed', tr('{orgName} has closed.', { orgName: thread.name }));
  if (thread.suspended_at)
    throw new AppError(
      409,
      'org_suspended',
      tr('{orgName} can’t be reached on Caime right now.', { orgName: thread.name }),
    );
  if (thread.calls_from !== 'customers')
    throw forbidden(tr('{orgName} doesn’t take calls on Caime.', { orgName: thread.name }));
  // As for writing: a block either way, and someone under 18 to an organization that hasn't
  // proved who it is (R29).
  await assertCanWrite(ctx, conversationId, userId);
  const me = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (!minorMayWriteToOrg(minorOf(me, ctx.now()), thread.verified_at !== null))
    throw forbidden(tr('{orgName} doesn’t take calls on Caime.', { orgName: thread.name }));
  // Its people in the thread, on Caime, and not on another call now: whoever is busy isn't rung,
  // which nobody is told.
  const now = ctx.now().getTime();
  const fresh = new Date(now - CALL_SEEN_MS);
  const team = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('org_members as m', (j) =>
      j.onRef('m.user_id', '=', 'p.user_id').on('m.org_id', '=', thread.org_id),
    )
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select('p.user_id')
    .where('p.conversation_id', '=', conversationId)
    .where('p.left_at', 'is', null)
    .where('m.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where('u.suspended_at', 'is', null)
    .where('p.user_id', '<>', userId)
    .where((eb) =>
      eb.not(
        eb.or([
          eb.exists(
            eb
              .selectFrom('calls as c')
              .select('c.id')
              .where('c.is_group', '=', false)
              .where((w) =>
                w.or([
                  w('c.caller_id', '=', w.ref('p.user_id')),
                  w('c.callee_id', '=', w.ref('p.user_id')),
                ]),
              )
              .where((w) =>
                w.or([
                  w.and([
                    w('c.state', '=', 'ringing'),
                    w('c.created_at', '>', new Date(now - CALL_RING_SECONDS * 1000)),
                  ]),
                  w.and([
                    w('c.state', '=', 'active'),
                    w('c.caller_seen_at', '>', fresh),
                    w('c.callee_seen_at', '>', fresh),
                  ]),
                ]),
              ),
          ),
          eb.exists(
            eb
              .selectFrom('call_members as cm')
              .innerJoin('calls as g', 'g.id', 'cm.call_id')
              .select('cm.call_id')
              .whereRef('cm.user_id', '=', 'p.user_id')
              .where('g.state', '<>', 'ended')
              .where('cm.state', '=', 'joined'),
          ),
        ]),
      ),
    )
    .execute();
  return { orgId: thread.org_id, orgName: thread.name, team: team.map((t) => t.user_id) };
}

/**
 * One of the team turned the ring down: theirs stops, and once every one rung has, the call is
 * over. Answers whether nobody is left ringing.
 */
export async function declineTeamRing(
  ctx: AppContext,
  call: Call,
  userId: string,
): Promise<boolean> {
  await ctx.db
    .updateTable('call_team_rings')
    .set({ declined_at: ctx.now() })
    .where('call_id', '=', call.id)
    .where('user_id', '=', userId)
    .where('declined_at', 'is', null)
    .execute();
  const left = await ctx.db
    .selectFrom('call_team_rings')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('call_id', '=', call.id)
    .where('declined_at', 'is', null)
    .executeTakeFirstOrThrow();
  return left.n === 0;
}

/**
 * The customer places the call (M16 H8a): one call a person at a time, as any call, marked for
 * the organization, ringing each of its team the target found. Nobody to ring rings for the
 * customer alone and is missed, as a call to someone busy is: the customer isn't told why.
 */
export async function placeOrgCall(
  ctx: AppContext,
  input: { conversationId: string; callerId: string; kind: CallKind; deviceId: string },
): Promise<{ call: Call; team: string[]; orgName: string }> {
  const target = await orgCallTarget(ctx, input.conversationId, input.callerId);
  return ctx.db.transaction().execute(async (trx) => {
    await lockCallEntry(trx, input.callerId);
    if (
      (await liveCallOf(ctx, input.callerId, trx)) ||
      (await joinedGroupCallOf(ctx, input.callerId, trx))
    )
      throw new AppError(409, 'in_call', tr('You’re already in a call.'));
    const call = await trx
      .insertInto('calls')
      .values({
        id: uuidv7(),
        conversation_id: input.conversationId,
        caller_id: input.callerId,
        callee_id: null,
        org_id: target.orgId,
        kind: input.kind,
        state: 'ringing',
        caller_device: input.deviceId,
        created_at: ctx.now(),
        seen_at: ctx.now(),
        caller_seen_at: ctx.now(),
        callee_rung: target.team.length > 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (target.team.length)
      await trx
        .insertInto('call_team_rings')
        .values(target.team.map((userId) => ({ call_id: call.id, user_id: userId })))
        .execute();
    return { call, team: target.team, orgName: target.orgName };
  });
}
