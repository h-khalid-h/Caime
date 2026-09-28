/**
 * Devices for private conversations (R18, PRD §61): a device signed in to Caime registers its
 * public keys (its private keys never leave it) with its own signature over them. The first of a
 * person's devices vouches for itself; each later one waits until one of theirs approves it. A
 * person sees and removes their devices (removing one signs it out), and gets the devices of
 * everyone in a private conversation to seal messages for, with what vouches for each.
 */
import {
  ApproveDeviceBody,
  type ConversationDevicesView,
  type MyDeviceView,
  RegisterDeviceBody,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { chainOf, type LiveDevice, liveDevicesOf, MAX_DEVICES, publicView } from '../lib/e2ee';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { isBlockedEitherWay } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';

export async function e2eeRoutes(app: FastifyInstance, ctx: AppContext) {
  const signedIn = (req: Parameters<typeof requireAuth>[0]) => {
    const auth = requireAuth(req);
    // A token or an app acts for someone; it never reads their private conversations.
    if (auth.kind !== 'web' && auth.kind !== 'native')
      throw forbidden('Only a device signed in to Caime reads private conversations.');
    return auth;
  };
  const myView = (d: LiveDevice, sessionId: string): MyDeviceView => ({
    ...publicView(d),
    name: d.name,
    current: d.sessionId === sessionId,
    createdAt: d.createdAt,
    approved: d.approved,
  });
  const mine = async (userId: string, sessionId: string) =>
    (await liveDevicesOf(ctx, [userId], { waiting: true })).map((d) => myView(d, sessionId));

  /**
   * This device's public keys, for the session it's signed in with (one device a session). The
   * first of the person's devices vouches for itself; a later one waits for one of theirs to
   * approve it, unless they start over here (every other device of theirs is retired).
   */
  app.post('/e2ee/devices', async (req, reply): Promise<{ device: MyDeviceView }> => {
    const auth = signedIn(req);
    const body = parse(RegisterDeviceBody, req.body);
    ctx.limiter.hit(`e2ee-device:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const live = await liveDevicesOf(ctx, [auth.userId], { waiting: true });
    const others = live.filter((d) => d.sessionId !== auth.sessionId);
    if (others.length >= MAX_DEVICES && !body.startOver)
      throw new AppError(
        409,
        'too_many_devices',
        `Private conversations open on up to ${MAX_DEVICES} devices: remove one in Settings first.`,
      );
    const taken = await ctx.db
      .selectFrom('e2ee_devices')
      .select('id')
      .where('id', '=', body.id)
      .executeTakeFirst();
    if (taken) throw new AppError(409, 'device_exists', 'That device is registered already.');
    const first = body.startOver === true || !others.some((d) => d.approved);
    const replaced = live.find((d) => d.sessionId === auth.sessionId);
    await ctx.db.transaction().execute(async (trx) => {
      // Registering again (keys lost from this browser) replaces what this session had; starting
      // over retires every other device of theirs too.
      await trx
        .updateTable('e2ee_devices')
        .set({ revoked_at: ctx.now() })
        .where('user_id', '=', auth.userId)
        .where('revoked_at', 'is', null)
        .$if(!body.startOver, (q) => q.where('session_id', '=', auth.sessionId))
        .execute();
      await trx
        .insertInto('e2ee_devices')
        .values({
          id: body.id,
          user_id: auth.userId,
          session_id: auth.sessionId,
          name: body.name ?? null,
          encryption_key: JSON.stringify(body.encryptionKey),
          signing_key: JSON.stringify(body.signingKey),
          introduced_by: null,
          introduction: body.introduction,
          approved_at: first ? ctx.now() : null,
          created_at: ctx.now(),
        })
        .execute();
    });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: first ? 'e2ee.device_first' : 'e2ee.device_waiting',
      target: body.id,
      metadata: { startOver: Boolean(body.startOver) },
    });
    // Their own devices hear of it (one waiting is theirs to approve); everyone they share a
    // private conversation with does once what's sealed for changes.
    await tellDevicesChanged(auth.userId, first || Boolean(replaced?.approved));
    reply.status(201);
    const device = (await mine(auth.userId, auth.sessionId)).find((d) => d.id === body.id);
    if (!device) throw notFound('That device');
    return { device };
  });

  /** My devices that read private conversations, those waiting too, and what vouches for them. */
  app.get(
    '/e2ee/devices',
    async (req): Promise<{ devices: MyDeviceView[]; chain: ConversationDevicesView['chain'] }> => {
      const auth = signedIn(req);
      const devices = await mine(auth.userId, auth.sessionId);
      return {
        devices,
        chain: await chainOf(
          ctx,
          devices.filter((d) => d.approved).map((d) => d.id),
          [auth.userId],
        ),
      };
    },
  );

  /**
   * One of my devices approves another of mine that's waiting: its signature over the new one's
   * introduction. Only a device already approved (or the first) approves.
   */
  app.post('/e2ee/devices/:id/approve', async (req): Promise<{ device: MyDeviceView }> => {
    const auth = signedIn(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ApproveDeviceBody, req.body);
    const live = await liveDevicesOf(ctx, [auth.userId], { waiting: true });
    const by = live.find((d) => d.sessionId === auth.sessionId && d.approved);
    if (!by)
      throw forbidden(
        'Approve it from a device that reads your private conversations already: this one doesn’t yet.',
      );
    if (!live.some((d) => d.id === id && !d.approved)) throw notFound('That device');
    const done = await ctx.db
      .updateTable('e2ee_devices')
      .set({ introduced_by: by.id, introduction: body.introduction, approved_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('approved_at', 'is', null)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!done) throw notFound('That device');
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'e2ee.device_approved',
      target: id,
      metadata: { by: by.id },
    });
    await tellDevicesChanged(auth.userId, true);
    const device = (await mine(auth.userId, auth.sessionId)).find((d) => d.id === id);
    if (!device) throw notFound('That device');
    return { device };
  });

  /**
   * Removed: nothing more is sealed for it, and it's signed out, so it can't simply register
   * again (what it had stays on it until then).
   */
  app.delete('/e2ee/devices/:id', async (req): Promise<{ ok: true; signedOut: boolean }> => {
    const auth = signedIn(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const gone = await ctx.db
      .updateTable('e2ee_devices')
      .set({ revoked_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .returning(['session_id', 'approved_at'])
      .executeTakeFirst();
    if (!gone) throw notFound('That device');
    if (gone.session_id)
      await ctx.db
        .updateTable('sessions')
        .set({ revoked_at: ctx.now() })
        .where('id', '=', gone.session_id)
        .where('user_id', '=', auth.userId)
        .where('revoked_at', 'is', null)
        .execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'e2ee.device_removed',
      target: id,
      metadata: { session: gone.session_id },
    });
    await tellDevicesChanged(auth.userId, gone.approved_at !== null);
    return { ok: true, signedOut: gone.session_id === auth.sessionId };
  });

  /**
   * Everyone's devices in a private conversation, to seal a message for, and every device that
   * vouches for them; and, by `ids`, devices that sealed messages in it before (signed out since,
   * or their account deleted), to check those messages with.
   */
  app.get('/conversations/:id/devices', async (req): Promise<ConversationDevicesView> => {
    const auth = signedIn(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const q = parse(z.object({ ids: z.string().max(4000).optional() }).strict(), req.query);
    const { conversation } = await membership(ctx, auth.userId, id);
    if (conversation.privacy_class !== 'private')
      throw badRequest('Only private conversations are sealed.');
    const rows = await ctx.db
      .selectFrom('participants')
      .select(['user_id', 'left_at'])
      .where('conversation_id', '=', id)
      .execute();
    let people = rows.filter((r) => r.left_at === null).map((r) => r.user_id);
    // Blocked either way, a direct conversation's other person isn't written to: nothing of
    // their devices (nor of when they sign in anywhere) is shown.
    if (conversation.kind === 'direct') {
      const other = people.find((p) => p !== auth.userId);
      if (other && (await isBlockedEitherWay(ctx.db, auth.userId, other)))
        people = people.filter((p) => p !== other);
    }
    const devices = await liveDevicesOf(ctx, people);
    const uuid = z.string().uuid();
    const wanted = [...new Set((q.ids ?? '').split(','))]
      .filter((x) => uuid.safeParse(x).success)
      .slice(0, 100);
    // A past sender is someone who is or was in it, or a device that sealed a message in it (its
    // person's account deleted since).
    const senders = wanted.length
      ? await ctx.db
          .selectFrom('e2ee_devices as d')
          .select(['d.id', 'd.user_id'])
          .where('d.id', 'in', wanted)
          .where((eb) =>
            eb.or([
              eb(
                'd.user_id',
                'in',
                eb.selectFrom('participants').select('user_id').where('conversation_id', '=', id),
              ),
              eb.exists(
                eb
                  .selectFrom('messages as m')
                  .select('m.id')
                  .where('m.conversation_id', '=', id)
                  .where(sql<boolean>`m.sealed->>'from' = d.id::text`),
              ),
            ]),
          )
          .execute()
      : [];
    const users = [...new Set([...rows.map((r) => r.user_id), ...senders.map((s) => s.user_id)])];
    return {
      people,
      devices: devices.map(publicView),
      chain: await chainOf(ctx, [...devices.map((d) => d.id), ...senders.map((s) => s.id)], users),
    };
  });

  /**
   * Someone's devices changed: their own devices hear of it (one waiting is theirs to approve),
   * and, when what's sealed for changed, so does everyone in a private conversation with them
   * (never someone blocked either way in a direct one).
   */
  async function tellDevicesChanged(userId: string, others: boolean) {
    await ctx.bus.publish([userId], {
      type: 'devices.changed',
      data: { userId, conversationIds: [] },
    });
    if (!others) return;
    const rows = await ctx.db
      .selectFrom('participants as me')
      .innerJoin('conversations as c', 'c.id', 'me.conversation_id')
      .innerJoin('participants as p', 'p.conversation_id', 'c.id')
      .select(['c.id', 'c.kind', 'p.user_id'])
      .where('me.user_id', '=', userId)
      .where('me.left_at', 'is', null)
      .where('p.left_at', 'is', null)
      .where('p.user_id', '!=', userId)
      .where('c.privacy_class', '=', 'private')
      .execute();
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      if (r.kind === 'direct' && (await isBlockedEitherWay(ctx.db, userId, r.user_id))) continue;
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
    }
    for (const [to, conversationIds] of byUser)
      await ctx.bus.publish([to], {
        type: 'devices.changed',
        data: { userId, conversationIds },
      });
  }
}
