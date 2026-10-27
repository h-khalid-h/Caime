/**
 * Conversations (PRD §22, §56–§58): starting one, its topics, its details, who's in it and who
 * runs it, requests, read positions and typing. Messages are `modules/messages.ts`; what every
 * module shares about a conversation is `lib/conversation-views.ts` and `lib/topics.ts`.
 */
/**
 * Conversations and messages (PRD §15–§22, §26, §56; R14).
 */

import {
  ConversationByEmailBody,
  CreateConversationBody,
  canAddToGroup,
  canChangeGroupRole,
  canRemoveFromGroup,
  handsOverOnLeaving,
  isLargeGroup,
  MembersBody,
  PRIVATE_GROUP_MAX,
  REQUESTS_PER_DAY,
  ReceiptsBody,
  SpaceRoleBody,
  systemAccountOf,
  TopicBody,
  tr,
  UpdateConversationBody,
  uuidv7,
} from '@caime/core';
import type {
  ConversationIdResponse,
  ConversationResponse,
  MembersAddedResponse,
  OkResponse,
  PersonConversationsResponse,
  RequestAnsweredResponse,
} from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { USER_COLUMNS } from '../db/schema';
import { assertAgeChecked } from '../lib/age';
import { tellSaved } from '../lib/automations';
import { assertCanWrite } from '../lib/blocks';
import { endCaiAnswer } from '../lib/cai-answers';
import { chatExport } from '../lib/chat-export';
import { canEditConversation, contextEditable, contextVisible } from '../lib/contexts';
import {
  conversationView,
  hadSeat,
  membership,
  privateGroupFull,
  sendSystem,
  TOPIC_PEOPLE,
} from '../lib/conversation-views';
import {
  ensureDirectConversation,
  handOverGroup,
  isGroupTopic,
  lockConversation,
  mirrorTopics,
  seatIn,
} from '../lib/conversations';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { askGuardian, moderatorOf, withdrawGuardianAsk } from '../lib/family-moderation';
import { leaveGroupCallsIn } from '../lib/group-calls';
import { addToGroup, tellTopics } from '../lib/group-members';
import { assertOpenToApps } from '../lib/member-apps';
import { assertCanMessage, participantsOf } from '../lib/messages';
import { assertNoMinorWhereNoneMay, invitePeople, whoMustBeAsked } from '../lib/place-invites';
import { openMailConversation } from '../lib/provisional';
import { between, pairKey, readReceiptsVisibleTo } from '../lib/relations';
import { spaceChanged } from '../lib/spaces';
import { openSystemConversation } from '../lib/system-accounts';
import { assertCanStartTopic, createTopicConversation } from '../lib/topics';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/**
 * A new message request counts toward the day's (M16 B4, `REQUESTS_PER_DAY`): reaching out, never
 * a flood. One already started (answered or not) reopens without counting.
 */
async function assertRequestRoom(ctx: AppContext, senderId: string, targetId: string) {
  const open = await ctx.db
    .selectFrom('conversations')
    .select('id')
    .where('direct_key', '=', pairKey(senderId, targetId).key)
    .where('is_general', '=', true)
    .executeTakeFirst();
  if (open) return;
  // Writing first to someone you're not connected with (M16 B7): checked first, where asked.
  await assertAgeChecked(ctx, senderId, 'stranger');
  const started = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', 'p.conversation_id', 'c.id')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('c.created_by', '=', senderId)
    .where('c.kind', '=', 'direct')
    .where('c.created_at', '>', new Date(ctx.now().getTime() - 86_400_000))
    .where('p.user_id', '<>', senderId)
    .where('p.request_state', 'is not', null)
    .executeTakeFirstOrThrow();
  if (started.n >= REQUESTS_PER_DAY)
    throw new AppError(
      429,
      'requests_today',
      tr('That’s {n} message requests today. Try again tomorrow, or connect with them first.', {
        n: REQUESTS_PER_DAY,
      }),
    );
}

export async function conversationRoutes(app: FastifyInstance, ctx: AppContext) {
  // Writing to an address that isn't on Caime yet (R93): its one-to-one, by mail from here.
  app.post('/conversations/by-email', async (req, reply): Promise<ConversationResponse> => {
    const auth = requireAuth(req);
    const body = parse(ConversationByEmailBody, req.body);
    const result = await openMailConversation(ctx, auth.userId, body.email, body.name);
    if (result.created) reply.status(201);
    const m = await membership(ctx, auth.userId, result.id);
    return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
  });

  app.post('/conversations', async (req, reply): Promise<ConversationResponse> => {
    const auth = requireAuth(req);
    const body = parse(CreateConversationBody, req.body);
    if (body.kind === 'direct') {
      if (body.userId === auth.userId) throw badRequest(tr('That’s you.'));
      const b = await between(ctx.db, auth.userId, body.userId);
      if (b.blockedByMe || b.blockedMe) throw forbidden(tr('You can’t message this person.'));
      // Cai or a Caime Friend (R67): one conversation each, opened by the person and greeted once.
      const account = systemAccountOf(body.userId);
      if (account) {
        if (body.title || body.private)
          throw badRequest(tr('{name} talks in one conversation.', { name: account.name }));
        const result = await openSystemConversation(ctx, auth.userId, account);
        if (result.created) reply.status(201);
        const m = await membership(ctx, auth.userId, result.id);
        return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
      }
      // Someone reached by email (R93): written to by mail, as their address is, never connected.
      const reached = await ctx.db
        .selectFrom('users')
        .select('email')
        .where('id', '=', body.userId)
        .where('kind', '=', 'provisional')
        .executeTakeFirst();
      if (reached) {
        if (body.title || body.private || !reached.email)
          throw badRequest(tr('Someone reached by email is written to by email.'));
        const result = await openMailConversation(ctx, auth.userId, reached.email, undefined);
        if (result.created) reply.status(201);
        const m = await membership(ctx, auth.userId, result.id);
        return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
      }
      if (body.title || body.private) {
        if (!b.connected)
          throw forbidden(
            body.private
              ? tr('Connect first to start a private conversation.')
              : tr('Connect first to start topics.'),
          );
        const general = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
          connectionId: b.connectionId,
          createdBy: auth.userId,
        });
        // A private one (R18) is a conversation of its own with them, end to end encrypted: the
        // one already there, unless it's given a name of its own.
        const existing =
          body.private && !body.title
            ? await ctx.db
                .selectFrom('conversations as c')
                .innerJoin('participants as p', 'p.conversation_id', 'c.id')
                .select('c.id')
                .where('c.direct_key', '=', pairKey(auth.userId, body.userId).key)
                .where('c.privacy_class', '=', 'private')
                .where('c.is_general', '=', false)
                .where('c.title', '=', 'Private')
                .where('p.user_id', '=', auth.userId)
                .where('p.left_at', 'is', null)
                .orderBy('c.created_at')
                .executeTakeFirst()
            : undefined;
        if (existing) {
          const m = await membership(ctx, auth.userId, existing.id);
          return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
        }
        const id = await createTopicConversation(
          ctx,
          auth.userId,
          general.id,
          body.title ?? 'Private',
          body.private ? 'private' : 'standard',
        );
        // Only a context they may change (and so can see): an id alone opens nothing.
        if (body.contextId && (await contextEditable(ctx.db, auth.userId, body.contextId)))
          await ctx.db
            .updateTable('conversations')
            .set({ context_id: body.contextId })
            .where('id', '=', id)
            .execute();
        reply.status(201);
        const m = await membership(ctx, auth.userId, id);
        return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
      }
      if (!b.connected) {
        await assertCanMessage(ctx, auth.userId, body.userId);
        await assertRequestRoom(ctx, auth.userId, body.userId);
      }
      const result = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
        connectionId: b.connectionId,
        createdBy: auth.userId,
        requestFrom: b.connected ? null : auth.userId,
      });
      if (result.created) reply.status(201);
      const m = await membership(ctx, auth.userId, result.id);
      return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
    }
    // Groups are made of people you're connected with (anti-abuse, PRD §55), or of nobody yet,
    // to be joined by the link its owner hands out (M16 C3e).
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== auth.userId))];
    if (body.private && memberIds.length + 1 > PRIVATE_GROUP_MAX) throw privateGroupFull();
    const connected = memberIds.length
      ? await ctx.db
          .selectFrom('connection_sides as s')
          .innerJoin('connections as c', 'c.id', 's.connection_id')
          .select('s.other_id')
          .where('s.owner_id', '=', auth.userId)
          .where('s.other_id', 'in', memberIds)
          .where('c.status', '=', 'active')
          .execute()
      : [];
    if (connected.length !== memberIds.length)
      throw badRequest(tr('You can add people you’re connected with.'));
    // Whoever says to ask first, or would be under 18 among people they don't know, is invited
    // once it's made rather than put in (M16 B4).
    const asked = await whoMustBeAsked(ctx.db, null, memberIds, auth.userId, ctx.now());
    const putIn = memberIds.filter((u) => !asked.ask.has(u));
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('conversations')
        .values({
          id,
          kind: 'group',
          title: body.title,
          purpose: body.purpose ?? null,
          privacy_class: body.private ? 'private' : 'standard',
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('participants')
        // Joined now, on the app's clock: who's been in it longest decides who runs it next.
        .values([
          { conversation_id: id, user_id: auth.userId, role: 'owner', joined_at: ctx.now() },
          ...putIn.map((u) => ({
            conversation_id: id,
            user_id: u,
            role: 'member' as const,
            joined_at: ctx.now(),
          })),
        ])
        .execute();
      await recordEvent(trx, 'conversation.created', auth.userId, {
        conversationId: id,
        kind: 'group',
      });
    });
    const creator = await ctx.db
      .selectFrom('users')
      .select(['display_name'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    await sendSystem(ctx, id, auth.userId, 'group_created', {
      title: body.title,
      by: creator.display_name,
    });
    await ctx.bus.publish([auth.userId, ...putIn], {
      type: 'conversation.created',
      data: { conversationId: id },
    });
    await invitePeople(
      ctx,
      { kind: 'group', id },
      [...asked.ask].filter((u) => !asked.silent.has(u)),
      auth.userId,
    );
    reply.status(201);
    const m = await membership(ctx, auth.userId, id);
    return {
      conversation: await conversationView(ctx, auth.userId, m.conversation, m.me),
      invited: [...asked.ask],
    };
  });

  /** Start a topic (PRD §58): in a one-to-one, a group, or a space's General. */
  app.post('/conversations/:id/topics', async (req, reply): Promise<ConversationIdResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { title } = parse(TopicBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    await assertCanStartTopic(ctx, auth.userId, conversation);
    const conversationId = await createTopicConversation(ctx, auth.userId, id, title);
    reply.status(201);
    return { conversationId };
  });

  // One conversation as a text file (M16 E7): WhatsApp's own lines, on the reader's clock, so
  // any WhatsApp importer reads it back. Downloaded, as the data export is.
  app.get('/conversations/:id/export.txt', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    ctx.limiter.hit(`chat-export:${auth.userId}`, ctx.config.isTest ? 1000 : 6, 60_000);
    const { text } = await chatExport(ctx, auth.userId, id);
    const date = ctx.now().toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="caime-chat-${date}.txt"`)
      .header('cache-control', 'no-store')
      .type('text/plain; charset=utf-8')
      .send(text);
  });

  app.get('/conversations/:id', async (req): Promise<ConversationResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    await assertOpenToApps(ctx, auth, id);
    return { conversation: await conversationView(ctx, auth.userId, conversation, me) };
  });

  app.patch('/conversations/:id', async (req): Promise<ConversationResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(UpdateConversationBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    // What's being written in a private conversation stays on the device writing it.
    if (body.draft && conversation.privacy_class === 'private')
      throw badRequest(tr('Drafts in a private conversation stay on your device.'));
    const shared: Record<string, unknown> = {};
    if (
      body.title !== undefined ||
      body.purpose !== undefined ||
      body.contextId !== undefined ||
      body.retentionDays !== undefined
    ) {
      if (!canEditConversation(conversation.kind, me.role))
        throw forbidden(tr('Only admins can change this.'));
      // A topic's messages disappear as its group's do: that's changed in the group.
      if (body.retentionDays !== undefined && isGroupTopic(conversation))
        throw badRequest(tr('A topic’s messages disappear as its group’s do: change it there.'));
      // Linked only to a context they may change: an id alone opens nothing, and one they only
      // read (a group's, where they're a member) isn't theirs to take somewhere they'd run it.
      if (body.contextId) {
        if (!(await contextVisible(ctx.db, auth.userId, body.contextId)))
          throw notFound(tr('That context'));
        if (!(await contextEditable(ctx.db, auth.userId, body.contextId)))
          throw forbidden(tr('Only someone who may change that context links it here.'));
      }
      if (body.title !== undefined) {
        if (conversation.kind === 'direct' && conversation.is_general)
          throw badRequest(tr('The general conversation takes the person’s name.'));
        if (conversation.space_id && conversation.is_general)
          throw badRequest(tr('General takes the space’s name. Rename the space instead.'));
        shared.title = body.title;
      }
      if (body.purpose !== undefined) shared.purpose = body.purpose;
      if (body.contextId !== undefined) shared.context_id = body.contextId;
      if (body.retentionDays !== undefined) shared.retention_days = body.retentionDays;
      await ctx.db
        .updateTable('conversations')
        .set({ ...shared, updated_at: ctx.now() })
        .where('id', '=', id)
        .execute();
      // Everyone sees what changed about it, and who changed it.
      if (body.title !== undefined && body.title !== conversation.title)
        await sendSystem(ctx, id, auth.userId, 'renamed', { title: body.title });
      if (body.purpose !== undefined && (body.purpose ?? null) !== (conversation.purpose ?? null))
        await sendSystem(ctx, id, auth.userId, 'purpose_changed', {
          purpose: body.purpose ?? null,
        });
      if (body.retentionDays !== undefined && body.retentionDays !== conversation.retention_days)
        await sendSystem(ctx, id, auth.userId, 'retention_changed', { days: body.retentionDays });
      // A group's topics go as it goes: its disappearing messages are theirs, and each says so.
      if (conversation.kind === 'group' && !conversation.parent_id) {
        const topics = await ctx.db
          .selectFrom('conversations')
          .select(['id', 'retention_days'])
          .where('parent_id', '=', id)
          .where('kind', '=', 'group')
          .execute();
        if (body.retentionDays !== undefined) {
          const days = body.retentionDays;
          const moved = topics.filter((x) => x.retention_days !== days);
          if (moved.length) {
            await ctx.db
              .updateTable('conversations')
              .set({ retention_days: days, updated_at: ctx.now() })
              .where(
                'id',
                'in',
                moved.map((x) => x.id),
              )
              .execute();
            for (const x of moved)
              await sendSystem(ctx, x.id, auth.userId, 'retention_changed', { days });
          }
        }
        // Each topic shows the group's name (and its disappearing messages): theirs changed too.
        if (topics.length && (body.title !== undefined || body.retentionDays !== undefined))
          for (const x of topics)
            await ctx.bus.publish(
              (await participantsOf(ctx.db, x.id)).map((p) => p.user_id),
              { type: 'conversation.updated', data: { conversationId: x.id } },
            );
      }
      // A group lists its topics by name.
      if (body.title !== undefined && isGroupTopic(conversation) && conversation.parent_id)
        await ctx.bus.publish(
          (await participantsOf(ctx.db, conversation.parent_id)).map((p) => p.user_id),
          { type: 'conversation.updated', data: { conversationId: conversation.parent_id } },
        );
    }
    const mine = {
      ...(body.attention !== undefined ? { attention: body.attention } : {}),
      ...(body.mutedUntil !== undefined ? { muted_until: body.mutedUntil } : {}),
      ...(body.archived !== undefined ? { archived_at: body.archived ? ctx.now() : null } : {}),
      ...(body.pinned !== undefined ? { pinned_at: body.pinned ? ctx.now() : null } : {}),
      ...(body.markedUnread !== undefined
        ? { marked_unread_at: body.markedUnread ? ctx.now() : null }
        : {}),
      ...(body.draft !== undefined ? { draft: body.draft, draft_updated_at: ctx.now() } : {}),
    };
    // Only what was sent: an empty SET is invalid SQL (renaming a group used to fail here).
    if (Object.keys(mine).length)
      await ctx.db
        .updateTable('participants')
        .set(mine)
        .where('conversation_id', '=', id)
        .where('user_id', '=', auth.userId)
        .execute();
    const everyone = Object.keys(shared).length > 0;
    const recipients = everyone
      ? (await participantsOf(ctx.db, id)).map((p) => p.user_id)
      : [auth.userId];
    await ctx.bus.publish(recipients, {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    const m = await membership(ctx, auth.userId, id);
    return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
  });

  app.post('/conversations/:id/request', async (req): Promise<RequestAnsweredResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { decision } = parse(z.object({ decision: z.enum(['accept', 'decline']) }), req.body);
    const { me } = await membership(ctx, auth.userId, id);
    if (me.request_state !== 'pending') throw badRequest(tr('There’s no request to answer here.'));
    // A child whose parent says yes to new people first (R122 (2), Moderate): their accept is
    // asked of the parent. A decline is theirs alone.
    if (decision === 'accept') {
      const parent = await moderatorOf(ctx.db, auth.userId, ctx.now());
      if (parent) {
        await askGuardian(ctx, parent, auth.userId, { kind: 'request', conversationId: id });
        return { ok: true, askedParent: true };
      }
    }
    // Declined while its parent was asked: nothing waits on them any more.
    else await withdrawGuardianAsk(ctx, auth.userId, { kind: 'request', conversationId: id });
    await ctx.db
      .updateTable('participants')
      .set({
        request_state: decision === 'accept' ? 'accepted' : 'declined',
        archived_at: decision === 'decline' ? ctx.now() : null,
      })
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    // Cai answering for them stops either way (M17 I16a): theirs to answer now.
    await endCaiAnswer(ctx, id, decision === 'accept' ? 'receiver' : 'declined', null, auth.userId);
    // Accepted, everyone in it hears (they may write again); declined, it reads to its sender as
    // unanswered (R14), so only the decider's own devices hear of it, at that moment or after.
    await ctx.bus.publish(
      decision === 'accept'
        ? (await participantsOf(ctx.db, id)).map((p) => p.user_id)
        : [auth.userId],
      { type: 'conversation.updated', data: { conversationId: id } },
    );
    return { ok: true };
  });

  app.post('/conversations/:id/members', async (req): Promise<MembersAddedResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(MembersBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct') throw badRequest(tr('Start a group to add people.'));
    if (conversation.kind === 'business')
      throw badRequest(tr('Its team is the organization’s: add people to the team instead.'));
    if (isGroupTopic(conversation)) throw badRequest(TOPIC_PEOPLE());
    if (!canAddToGroup(me.role)) throw forbidden(tr('Only admins can add people.'));
    if (conversation.space_id) {
      // A space's conversations hold its people: General all of them, the others who join.
      if (conversation.is_general) throw badRequest(tr('Add people to the space instead.'));
      const inSpace = await ctx.db
        .selectFrom('space_members')
        .select('user_id')
        .where('space_id', '=', conversation.space_id)
        .where('user_id', 'in', body.userIds)
        .where('left_at', 'is', null)
        .execute();
      if (inSpace.length !== new Set(body.userIds).size)
        throw badRequest(tr('Add them to the space first.'));
    } else {
      const connected = await ctx.db
        .selectFrom('connection_sides as s')
        .innerJoin('connections as c', 'c.id', 's.connection_id')
        .select('s.other_id')
        .where('s.owner_id', '=', auth.userId)
        .where('s.other_id', 'in', body.userIds)
        .where('c.status', '=', 'active')
        .execute();
      if (connected.length !== new Set(body.userIds).size)
        throw badRequest(tr('You can add people you’re connected with.'));
    }
    // Refused where nobody under 18 may be at all; else asked rather than put in where their
    // setting or their age says so (M16 B4).
    await assertNoMinorWhereNoneMay(ctx.db, { kind: 'group', id }, body.userIds, ctx.now());
    const asked = await whoMustBeAsked(
      ctx.db,
      { kind: 'group', id },
      body.userIds,
      auth.userId,
      ctx.now(),
    );
    const putIn = body.userIds.filter((u) => !asked.ask.has(u));
    const added = putIn.length
      ? await addToGroup(ctx, id, putIn, {
          actorId: auth.userId,
          // Who runs it, as they are now.
          vouch: async (trx) => {
            const mine = await seatIn(trx, id, auth.userId);
            if (!mine) throw notFound(tr('That conversation'));
            if (!canAddToGroup(mine.role)) throw forbidden(tr('Only admins can add people.'));
          },
        })
      : [];
    await invitePeople(
      ctx,
      { kind: 'group', id },
      [...asked.ask].filter((u) => !asked.silent.has(u)),
      auth.userId,
    );
    return { ok: true, added, invited: [...asked.ask] };
  });

  app.delete('/conversations/:id/members/:userId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, userId } = parse(
      z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
      req.params,
    );
    const leaving = userId === auth.userId;
    const found = await membership(ctx, auth.userId, id).catch(async (err: unknown) => {
      // Leaving from two devices at once: the second finds the seat left a moment ago. Done.
      if (
        leaving &&
        err instanceof AppError &&
        err.status === 404 &&
        (await hadSeat(ctx, id, userId))
      )
        return null;
      throw err;
    });
    if (!found) return { ok: true };
    const { conversation } = found;
    if (conversation.kind === 'direct' || conversation.kind === 'business')
      throw badRequest(tr('You can archive this conversation instead.'));
    if (isGroupTopic(conversation))
      throw badRequest(
        leaving
          ? tr('Leave the group to leave its topics. You can archive this one.')
          : TOPIC_PEOPLE(),
      );
    if (conversation.space_id && conversation.is_general)
      throw badRequest(
        userId === auth.userId
          ? tr('Leave the space to leave its General conversation.')
          : tr('Remove them from the space instead.'),
      );
    const done = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, id);
      // Read under the lock: a role changed, or someone gone, a moment ago counts.
      const me = await seatIn(trx, id, auth.userId);
      // Left already, from another of their devices: that's done.
      if (!me && leaving) return null;
      if (!me) throw notFound(tr('That conversation'));
      const target = leaving ? me : await seatIn(trx, id, userId);
      if (!target) throw notFound(tr('That person in this conversation'));
      // The owner removes anyone; admins remove members; anyone may leave (PRD §56).
      if (!leaving && !canRemoveFromGroup(me.role, target.role))
        throw forbidden(
          me.role === 'admin'
            ? tr('Admins remove members; the owner removes admins.')
            : tr('Only admins can remove people.'),
        );
      // Out, they're nobody in it: added again, they start as a member.
      await trx
        .updateTable('participants')
        .set({ left_at: ctx.now(), role: 'member' })
        .where('conversation_id', '=', id)
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .execute();
      // Whoever owned it hands it on as they go, so someone can always run it.
      const heir = handsOverOnLeaving(target.role) ? await handOverGroup(trx, id, userId) : null;
      // Out of the group is out of its topics, and they're run as it is now.
      const topics = await mirrorTopics(trx, id, ctx.now());
      // What Caime offered them about it, and its topics, is gone with them.
      await trx
        .updateTable('suggestions')
        .set({ status: 'expired', resolved_at: ctx.now() })
        .where('user_id', '=', userId)
        .where('conversation_id', 'in', [id, ...topics.map((t) => t.topicId)])
        .where('status', '=', 'pending')
        .execute();
      return { heir, topics };
    });
    if (!done) return { ok: true };
    const { heir, topics } = done;
    // What they saved of it is out of their Saved now, on every device.
    await tellSaved(ctx, [userId]);
    // Out of the conversation is out of its call, and its topics' calls.
    await leaveGroupCallsIn(ctx, userId, [
      id,
      ...topics.filter((t) => t.left.includes(userId)).map((t) => t.topicId),
    ]);
    await tellTopics(ctx, topics);
    await sendSystem(
      ctx,
      id,
      auth.userId,
      userId === auth.userId ? 'member_left' : 'member_removed',
      { userId },
    );
    if (heir) await sendSystem(ctx, id, auth.userId, 'owner_changed', { userId: heir });
    await ctx.bus.publish([userId, ...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    if (conversation.space_id) await spaceChanged(ctx, conversation.space_id);
    return { ok: true };
  });

  /** Make someone in a group an admin, or a member again: its owner does (PRD §56). */
  app.patch('/conversations/:id/members/:userId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, userId } = parse(
      z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
      req.params,
    );
    const body = parse(SpaceRoleBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct' || conversation.kind === 'business')
      throw badRequest(tr('Only a group has admins.'));
    if (isGroupTopic(conversation)) throw badRequest(TOPIC_PEOPLE());
    if (conversation.space_id && conversation.is_general)
      throw badRequest(tr('Make them an admin of the space instead.'));
    const changed = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, id);
      // Both as they are now: the owner may have just left, or handed it to them.
      const me = await seatIn(trx, id, auth.userId);
      if (!me) throw notFound(tr('That conversation'));
      const target = await seatIn(trx, id, userId);
      if (!target || !['admin', 'member'].includes(target.role))
        throw notFound(tr('That person in this conversation'));
      if (!canChangeGroupRole(me.role, target.role))
        throw forbidden(tr('Only the owner makes admins.'));
      if (target.role === body.role) return false;
      // Only from the role read: never over an owner someone just handed it to.
      const done = await trx
        .updateTable('participants')
        .set({ role: body.role })
        .where('conversation_id', '=', id)
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .where('role', '=', target.role)
        .executeTakeFirst();
      if (Number(done.numUpdatedRows) === 0) return null;
      // Its topics are run by the same people.
      return mirrorTopics(trx, id, ctx.now());
    });
    if (!changed) return { ok: true };
    await tellTopics(ctx, changed);
    await sendSystem(
      ctx,
      id,
      auth.userId,
      body.role === 'admin' ? 'admin_added' : 'admin_removed',
      { userId },
    );
    await ctx.bus.publish(
      (await participantsOf(ctx.db, id)).map((p) => p.user_id),
      {
        type: 'conversation.updated',
        data: { conversationId: id },
      },
    );
    return { ok: true };
  });

  app.post('/conversations/:id/receipts', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ReceiptsBody, req.body);
    // A device that hasn't heard yet that its person left (or was removed) may still say what
    // arrived: that's nothing to do now, and nothing to refuse. Anyone never in it is refused.
    // How many are in it comes with the same look (M16 D2b), for a group of many.
    const here = await ctx.db
      .selectFrom('participants')
      .select([
        sql<boolean>`coalesce(bool_or(user_id = ${auth.userId} and left_at is not null), false)`.as(
          'gone',
        ),
        sql<number>`count(*) filter (where left_at is null)::int`.as('present'),
      ])
      .where('conversation_id', '=', id)
      .executeTakeFirstOrThrow();
    if (here.gone) return { ok: true };
    const { conversation, me } = await membership(ctx, auth.userId, id);
    const last = Number(conversation.last_seq);
    const read = body.read !== undefined ? Math.min(body.read, last) : undefined;
    // A group of many shows nobody's ticks (M16 D2b): what arrived is nobody's news there, and
    // what's read is the reader's own (their unread count, their notification, their devices).
    const crowd = isLargeGroup(conversation.kind, here.present);
    if (crowd && read === undefined) return { ok: true };
    const delivered = Math.max(body.delivered ?? 0, read ?? 0);
    const patch: Record<string, number> = {};
    if (read !== undefined && read > Number(me.last_read_seq)) patch.last_read_seq = read;
    if (delivered > Number(me.last_delivered_seq))
      patch.last_delivered_seq = Math.min(delivered, last);
    if (Object.keys(patch).length === 0) return { ok: true };
    await ctx.db
      .updateTable('participants')
      // Reading it is coming back to it: a mark to come back (M16 E3b) goes with the read.
      .set(patch.last_read_seq !== undefined ? { ...patch, marked_unread_at: null } : patch)
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    // The organization has read it when someone on its team has (R15): the customer's "read".
    if (conversation.kind === 'business' && me.role === 'agent' && patch.last_read_seq)
      await ctx.db
        .updateTable('business_threads')
        .set({ team_read_seq: sql`greatest(team_read_seq, ${patch.last_read_seq})` })
        .where('conversation_id', '=', id)
        .execute();
    if (patch.last_read_seq !== undefined) {
      // Reading a conversation clears its notification.
      await ctx.db
        .updateTable('notifications')
        .set({ read_at: ctx.now() })
        .where('user_id', '=', auth.userId)
        .where('group_key', '=', `conv:${id}`)
        .where('read_at', 'is', null)
        .execute();
      await recordEvent(ctx.db, 'message.read', auth.userId, {
        conversationId: id,
        seq: String(patch.last_read_seq),
      });
    }
    const event = (readSeq: number | null) => ({
      type: 'receipts',
      data: {
        conversationId: id,
        userId: auth.userId,
        readSeq,
        deliveredSeq: patch.last_delivered_seq ?? null,
      },
    });
    if (crowd) {
      await ctx.bus.publish([auth.userId], event(patch.last_read_seq ?? null));
      return { ok: true };
    }
    // A message's ticks are its sender's to see, so an ack is news to whoever sent what it newly
    // covers (one query, bounded by the ack) and to the reader's own devices, never to a whole
    // group: a hundred people reading costs a hundred events, not ten thousand.
    const from = Number(
      patch.last_read_seq !== undefined ? me.last_read_seq : me.last_delivered_seq,
    );
    const to = Math.max(patch.last_delivered_seq ?? 0, patch.last_read_seq ?? 0);
    const senders = await ctx.db
      .selectFrom('messages as m')
      .innerJoin('participants as p', (join) =>
        join
          .onRef('p.user_id', '=', 'm.sender_id')
          .onRef('p.conversation_id', '=', 'm.conversation_id'),
      )
      .select(['m.sender_id', 'p.role'])
      .distinct()
      .where('m.conversation_id', '=', id)
      .where('m.seq', '>', String(from))
      .where('m.seq', '<=', String(to))
      .where('m.sender_id', 'is not', null)
      .where('m.sender_id', '!=', auth.userId)
      .where('p.left_at', 'is', null)
      .execute();
    const others = senders.map((s) => s.sender_id as string);
    // A request not yet answered, or declined, tells its sender nothing, not even that it arrived
    // (R14): only the reader's own devices hear of it.
    if (me.request_state === 'pending' || me.request_state === 'declined') {
      await ctx.bus.publish([auth.userId], event(null));
      return { ok: true };
    }
    if (patch.last_read_seq === undefined || others.length === 0) {
      await ctx.bus.publish([auth.userId, ...others], event(null));
      return { ok: true };
    }
    // Read positions are private unless both sides share them (R25): decided for all at once.
    const users = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', 'in', [auth.userId, ...others])
      .execute();
    const reader = users.find((u) => u.id === auth.userId);
    const viewers = users.filter((u) => u.id !== auth.userId);
    const visible = reader
      ? await readReceiptsVisibleTo(ctx.db, ctx.now(), reader, viewers)
      : new Set<string>();
    const allowed: string[] = [auth.userId];
    const withheld: string[] = [];
    const teamReadsForCustomer = conversation.kind === 'business' && me.role === 'agent';
    for (const viewer of viewers) {
      const customer = senders.find((s) => s.sender_id === viewer.id)?.role === 'member';
      ((teamReadsForCustomer && customer) || visible.has(viewer.id) ? allowed : withheld).push(
        viewer.id,
      );
    }
    await ctx.bus.publish(allowed, event(patch.last_read_seq));
    // Whoever may not see the read hears only what newly arrived, never a read's moment: an event
    // with nothing in it, sent as the reader reads, would say it all the same.
    if (withheld.length && patch.last_delivered_seq !== undefined)
      await ctx.bus.publish(withheld, event(null));
    return { ok: true };
  });

  app.post('/conversations/:id/typing', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation } = await membership(ctx, auth.userId, id);
    await assertCanWrite(ctx, id, auth.userId);
    ctx.limiter.hit(`typing:${auth.userId}:${id}`, 30, 60_000);
    const members = await participantsOf(ctx.db, id);
    // Nobody is seen typing in a group of many (M16 D2b), as on the socket.
    if (isLargeGroup(conversation.kind, members.length)) return { ok: true };
    await ctx.bus.publish(
      members.filter((m) => m.user_id !== auth.userId).map((m) => m.user_id),
      { type: 'typing', data: { conversationId: id, userId: auth.userId } },
    );
    return { ok: true };
  });

  /** "Doesn't need me" (R8): questions up to now stop counting toward Needs you. */
  app.post('/conversations/:id/dismiss', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation } = await membership(ctx, auth.userId, id);
    await ctx.db
      .updateTable('participants')
      .set({ dismissed_seq: conversation.last_seq })
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    // Needs you got it wrong for them (PRD §83): counted, never who or where.
    await recordEvent(ctx.db, 'attention.dismissed', null, {});
    await ctx.bus.publish([auth.userId], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    return { ok: true };
  });

  /** Every conversation I'm in with one person, general first. */
  app.get('/people/:id/conversations', async (req): Promise<PersonConversationsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { key } = pairKey(auth.userId, id);
    const rows = await ctx.db
      .selectFrom('conversations')
      .select(['id', 'title', 'is_general', 'last_message_at'])
      .where('direct_key', '=', key)
      .orderBy('is_general', 'desc')
      .orderBy('last_message_at', (ob) => ob.desc().nullsLast())
      .execute();
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.is_general ? 'General' : r.title,
        isGeneral: r.is_general,
        lastMessageAt: r.last_message_at?.toISOString() ?? null,
      })),
    };
  });
}
