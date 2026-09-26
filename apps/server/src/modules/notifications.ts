/**
 * Notifications API and device delivery (PRD §31–§33; ADR-14). Web Push uses VAPID keys the
 * server generates and stores on first boot; Expo push needs an Expo access token for production.
 */
import { PushSubscriptionBody, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import webpush from 'web-push';
import { z } from 'zod';
import type { AppContext } from '../context';
import { onNotification } from '../lib/notify';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function vapidKeys(
  ctx: AppContext,
): Promise<{ publicKey: string; privateKey: string }> {
  if (ctx.config.VAPID_PUBLIC_KEY && ctx.config.VAPID_PRIVATE_KEY) {
    return { publicKey: ctx.config.VAPID_PUBLIC_KEY, privateKey: ctx.config.VAPID_PRIVATE_KEY };
  }
  const stored = await ctx.db
    .selectFrom('server_settings')
    .select('value')
    .where('key', '=', 'vapid')
    .executeTakeFirst();
  if (stored) return stored.value as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  await ctx.db
    .insertInto('server_settings')
    .values({ key: 'vapid', value: JSON.stringify(keys) })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  const winner = await ctx.db
    .selectFrom('server_settings')
    .select('value')
    .where('key', '=', 'vapid')
    .executeTakeFirstOrThrow();
  return winner.value as { publicKey: string; privateKey: string };
}

function notificationView(n: {
  id: string;
  kind: string;
  level: string;
  title: string;
  body: string | null;
  data: unknown;
  count: number;
  delivery: string;
  reason: string | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: n.id,
    kind: n.kind,
    level: n.level,
    title: n.title,
    body: n.body,
    data: n.data,
    count: n.count,
    delivery: n.delivery,
    reason: n.reason,
    read: n.read_at !== null,
    createdAt: n.created_at.toISOString(),
    updatedAt: n.updated_at.toISOString(),
  };
}

export async function notificationRoutes(app: FastifyInstance, ctx: AppContext) {
  let keys: { publicKey: string; privateKey: string } | null = null;
  const ensureKeys = async () => {
    keys ??= await vapidKeys(ctx);
    webpush.setVapidDetails(ctx.config.VAPID_SUBJECT, keys.publicKey, keys.privateKey);
    return keys;
  };

  onNotification(async (c, id, input) => {
    const subs = await c.db
      .selectFrom('push_subscriptions')
      .selectAll()
      .where('user_id', '=', input.userId)
      .execute();
    if (subs.length === 0) return;
    const payload = JSON.stringify({
      id,
      title: input.title,
      body: input.body ?? '',
      tag: input.groupKey ?? id,
      level: input.level,
      data: input.data ?? {},
    });
    let delivered = false;
    for (const s of subs) {
      try {
        if (s.kind === 'webpush') {
          await ensureKeys();
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            payload,
            {
              TTL: 24 * 3600,
              urgency:
                input.level === 'urgency' ? 'high' : input.level === 'attention' ? 'normal' : 'low',
              topic:
                (input.groupKey ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
            },
          );
        } else {
          const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(c.config.EXPO_ACCESS_TOKEN
                ? { authorization: `Bearer ${c.config.EXPO_ACCESS_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({
              to: s.endpoint,
              title: input.title,
              body: input.body ?? '',
              data: { id, ...(input.data ?? {}) },
              priority: input.level === 'urgency' ? 'high' : 'default',
            }),
          });
          if (!res.ok)
            throw Object.assign(new Error(`expo push ${res.status}`), { statusCode: res.status });
        }
        delivered = true;
        await c.db
          .updateTable('push_subscriptions')
          .set({ last_success_at: c.now(), failures: 0 })
          .where('id', '=', s.id)
          .execute();
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await c.db.deleteFrom('push_subscriptions').where('id', '=', s.id).execute();
        } else {
          await c.db
            .updateTable('push_subscriptions')
            .set({ failures: sql`failures + 1` })
            .where('id', '=', s.id)
            .execute();
        }
      }
    }
    if (delivered)
      await c.db
        .updateTable('notifications')
        .set({ pushed_at: c.now() })
        .where('id', '=', id)
        .execute();
  });

  app.get('/notifications', async (req) => {
    const auth = requireAuth(req);
    const q = parse(
      z.object({
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const rows = await ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .where('dismissed_at', 'is', null)
      .$if(Boolean(q.before), (qb) => qb.where('updated_at', '<', new Date(q.before!)))
      .orderBy('updated_at', 'desc')
      .limit(q.limit)
      .execute();
    const unread = await ctx.db
      .selectFrom('notifications')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('user_id', '=', auth.userId)
      .where('read_at', 'is', null)
      .where('dismissed_at', 'is', null)
      .executeTakeFirstOrThrow();
    return { notifications: rows.map(notificationView), unread: unread.n };
  });

  app.post('/notifications/read', async (req) => {
    const auth = requireAuth(req);
    const body = parse(
      z.object({
        ids: z.array(z.string().uuid()).max(500).optional(),
        all: z.boolean().optional(),
      }),
      req.body,
    );
    let q = ctx.db
      .updateTable('notifications')
      .set({ read_at: ctx.now() })
      .where('user_id', '=', auth.userId)
      .where('read_at', 'is', null);
    if (!body.all)
      q = q.where(
        'id',
        'in',
        body.ids?.length ? body.ids : ['00000000-0000-0000-0000-000000000000'],
      );
    await q.execute();
    await ctx.bus.publish([auth.userId], {
      type: 'notifications.read',
      data: { ids: body.ids ?? null, all: body.all ?? false },
    });
    return { ok: true };
  });

  app.post('/notifications/:id/dismiss', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await ctx.db
      .updateTable('notifications')
      .set({ dismissed_at: ctx.now(), read_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    return { ok: true };
  });

  app.get('/push/vapid', async () => ({ publicKey: (await ensureKeys()).publicKey }));

  app.post('/push/subscriptions', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(PushSubscriptionBody, req.body);
    const endpoint = body.kind === 'webpush' ? body.subscription.endpoint : body.token;
    const keys = body.kind === 'webpush' ? body.subscription.keys : null;
    await ctx.db
      .insertInto('push_subscriptions')
      .values({
        id: uuidv7(),
        user_id: auth.userId,
        session_id: auth.sessionId,
        kind: body.kind,
        endpoint,
        keys: keys ? JSON.stringify(keys) : null,
      })
      .onConflict((oc) =>
        oc.column('endpoint').doUpdateSet({
          user_id: auth.userId,
          session_id: auth.sessionId,
          keys: keys ? JSON.stringify(keys) : null,
          failures: 0,
        }),
      )
      .execute();
    reply.status(201);
    return { ok: true };
  });

  app.delete('/push/subscriptions', async (req) => {
    const auth = requireAuth(req);
    const { endpoint } = parse(z.object({ endpoint: z.string().min(1) }), req.body);
    await ctx.db
      .deleteFrom('push_subscriptions')
      .where('user_id', '=', auth.userId)
      .where('endpoint', '=', endpoint)
      .execute();
    return { ok: true };
  });
}
