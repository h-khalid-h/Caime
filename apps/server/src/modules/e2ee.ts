/**
 * Devices for private conversations (R18, PRD §61): a device signed in to Caishy registers its
 * public keys (its private keys never leave it), sees and removes its person's others, and gets
 * the devices of everyone in a private conversation to seal messages for.
 */
import { type DeviceView, type MyDeviceView, RegisterDeviceBody, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { deviceView, liveDevicesOf, MAX_DEVICES } from '../lib/e2ee';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { participantsOf } from '../lib/messages';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';

export async function e2eeRoutes(app: FastifyInstance, ctx: AppContext) {
  const signedIn = (req: Parameters<typeof requireAuth>[0]) => {
    const auth = requireAuth(req);
    // A token or an app acts for someone; it never reads their private conversations.
    if (auth.kind !== 'web' && auth.kind !== 'native')
      throw forbidden('Only a device signed in to Caishy reads private conversations.');
    return auth;
  };
  const mine = async (userId: string, sessionId: string): Promise<MyDeviceView[]> =>
    (await liveDevicesOf(ctx, [userId])).map((d) => ({
      ...deviceView(d),
      name: d.name,
      current: d.sessionId === sessionId,
    }));

  /** This device's public keys, for the session it's signed in with (one device a session). */
  app.post('/e2ee/devices', async (req, reply): Promise<{ device: MyDeviceView }> => {
    const auth = signedIn(req);
    const body = parse(RegisterDeviceBody, req.body);
    ctx.limiter.hit(`e2ee-device:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const live = await liveDevicesOf(ctx, [auth.userId]);
    if (live.filter((d) => d.sessionId !== auth.sessionId).length >= MAX_DEVICES)
      throw new AppError(
        409,
        'too_many_devices',
        `Private conversations open on up to ${MAX_DEVICES} devices: remove one in Settings first.`,
      );
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      // Registering again (keys lost from this browser) replaces what this session had.
      await trx
        .updateTable('e2ee_devices')
        .set({ revoked_at: ctx.now() })
        .where('session_id', '=', auth.sessionId)
        .where('revoked_at', 'is', null)
        .execute();
      await trx
        .insertInto('e2ee_devices')
        .values({
          id,
          user_id: auth.userId,
          session_id: auth.sessionId,
          name: body.name ?? null,
          encryption_key: JSON.stringify(body.encryptionKey),
          signing_key: JSON.stringify(body.signingKey),
          created_at: ctx.now(),
        })
        .execute();
    });
    // Everyone this person has a private conversation with seals for this device from now on.
    await tellDevicesChanged(auth.userId);
    reply.status(201);
    const device = (await mine(auth.userId, auth.sessionId)).find((d) => d.id === id);
    if (!device) throw notFound('That device');
    return { device };
  });

  /** My devices that read private conversations. */
  app.get('/e2ee/devices', async (req): Promise<{ devices: MyDeviceView[] }> => {
    const auth = signedIn(req);
    return { devices: await mine(auth.userId, auth.sessionId) };
  });

  /** Removed: nothing more is sealed for it (what it had stays on it until it signs out). */
  app.delete('/e2ee/devices/:id', async (req) => {
    const auth = signedIn(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const gone = await ctx.db
      .updateTable('e2ee_devices')
      .set({ revoked_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!gone) throw notFound('That device');
    await tellDevicesChanged(auth.userId);
    return { ok: true };
  });

  /**
   * Everyone's devices in a private conversation, to seal a message for; and, by `ids`, devices
   * that sealed messages in it before, even signed out since, to check those messages with.
   */
  app.get(
    '/conversations/:id/devices',
    async (req): Promise<{ devices: DeviceView[]; senders: DeviceView[] }> => {
      const auth = signedIn(req);
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const q = parse(z.object({ ids: z.string().max(4000).optional() }).strict(), req.query);
      const { conversation } = await membership(ctx, auth.userId, id);
      if (conversation.privacy_class !== 'private')
        throw badRequest('Only private conversations are sealed.');
      const people = (await participantsOf(ctx.db, id)).map((p) => p.user_id);
      const wanted = [...new Set((q.ids ?? '').split(',').filter(Boolean))].slice(0, 100);
      const uuid = z.string().uuid();
      const ids = wanted.filter((x) => uuid.safeParse(x).success);
      const senders = ids.length
        ? await ctx.db
            .selectFrom('e2ee_devices')
            .select(['id', 'user_id', 'encryption_key', 'signing_key', 'created_at'])
            .where('id', 'in', ids)
            // Only devices of people who are, or were, in this conversation.
            .where(
              'user_id',
              'in',
              ctx.db.selectFrom('participants').select('user_id').where('conversation_id', '=', id),
            )
            .execute()
        : [];
      return {
        devices: (await liveDevicesOf(ctx, people)).map(deviceView),
        senders: senders.map((d) => ({
          id: d.id,
          userId: d.user_id,
          encryptionKey: d.encryption_key as DeviceView['encryptionKey'],
          signingKey: d.signing_key as DeviceView['signingKey'],
          createdAt: d.created_at.toISOString(),
        })),
      };
    },
  );

  /** Someone's devices changed: those in private conversations with them hear so. */
  async function tellDevicesChanged(userId: string) {
    const rows = await ctx.db
      .selectFrom('participants as me')
      .innerJoin('conversations as c', 'c.id', 'me.conversation_id')
      .innerJoin('participants as p', 'p.conversation_id', 'c.id')
      .select(['c.id', 'p.user_id'])
      .where('me.user_id', '=', userId)
      .where('me.left_at', 'is', null)
      .where('p.left_at', 'is', null)
      .where('c.privacy_class', '=', 'private')
      .execute();
    const byUser = new Map<string, string[]>();
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
    for (const [to, conversationIds] of byUser)
      await ctx.bus.publish([to], {
        type: 'devices.changed',
        data: { userId, conversationIds },
      });
  }
}
