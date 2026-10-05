/**
 * An organization's apps (PRD §73–75, R16), managed by its owner and admins: make one (its bot
 * joins the team; its token and webhook secret are shown once), change what it may do and hear,
 * replace its token or secret, test its webhook, see its deliveries, remove it.
 */
import { randomBytes } from 'node:crypto';
import {
  type ApiScope,
  type AppMeView,
  CreateOrgAppBody,
  canManageOrg,
  defaultPrivacy,
  type OrgAppSecretsView,
  type OrgAppView,
  UpdateOrgAppBody,
  uuidv7,
  type WebhookDeliveryView,
  type WebhookEvent,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { OrgApp, WebhookDelivery } from '../db/schema';
import {
  appViews,
  checkWebhookUrl,
  newApiToken,
  newWebhookSecret,
  queueDelivery,
  requeueDelivery,
} from '../lib/apps';
import { audit } from '../lib/audit';
import { joinThreads, leaveThreads } from '../lib/business';
import { forbidden, notFound } from '../lib/errors';
import { orgById, orgSeat } from '../lib/orgs';
import { assertAppRoom } from '../lib/plans';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function appRoutes(app: FastifyInstance, ctx: AppContext) {
  const orgParam = z.object({ id: z.string().uuid() });
  const appParam = z.object({ id: z.string().uuid(), appId: z.string().uuid() });

  async function manager(userId: string, orgId: string) {
    await orgById(ctx.db, orgId);
    const seat = await orgSeat(ctx.db, userId, orgId);
    if (!seat) throw notFound('That organization');
    if (!canManageOrg(seat.role)) throw forbidden('Only the organization’s owner and admins can.');
  }
  async function appOf(orgId: string, appId: string): Promise<OrgApp> {
    const found = await ctx.db
      .selectFrom('org_apps')
      .selectAll()
      .where('id', '=', appId)
      .where('org_id', '=', orgId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!found) throw notFound('That app');
    return found;
  }
  const viewOf = async (a: OrgApp): Promise<OrgAppView> => (await appViews(ctx, [a]))[0]!;
  const deliveryView = (d: WebhookDelivery): WebhookDeliveryView => ({
    id: d.id,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    lastStatus: d.last_status,
    lastError: d.last_error,
    createdAt: d.created_at.toISOString(),
    deliveredAt: d.delivered_at?.toISOString() ?? null,
  });
  const appOnly = (auth: ReturnType<typeof requireAuth>) => {
    if (!auth.app) throw forbidden('This route is for an app’s token.');
    return auth.app;
  };
  const webhook = (url: string | null | undefined) =>
    url ? checkWebhookUrl(url, ctx.config.WEBHOOKS_ALLOW_PRIVATE) : null;

  /** Who this token is (docs/API.md): the first call an integration makes, with nothing else. */
  app.get('/apps/me', async (req): Promise<AppMeView> => {
    const auth = requireAuth(req);
    if (!auth.app) throw forbidden('This route is for an app’s token.');
    const row = await ctx.db
      .selectFrom('org_apps as a')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .select([
        'a.id',
        'a.name',
        'a.org_id',
        'a.bot_user_id',
        'a.scopes',
        'a.events',
        'o.handle as org_handle',
        'o.name as org_name',
      ])
      .where('a.id', '=', auth.app.id)
      .where('a.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw notFound('That app');
    return {
      app: {
        id: row.id,
        name: row.name,
        orgId: row.org_id,
        orgHandle: row.org_handle,
        orgName: row.org_name,
        botUserId: row.bot_user_id,
        scopes: row.scopes as ApiScope[],
        events: row.events as WebhookEvent[],
      },
    };
  });

  /**
   * The app's own deliveries (docs/API.md): what went out, what failed and why, so an app that
   * was down reads what it missed. Newest first; with `after`, the ones since that delivery,
   * oldest first, so a reader walks forward from the last id it handled.
   */
  app.get('/apps/me/deliveries', async (req): Promise<{ deliveries: WebhookDeliveryView[] }> => {
    const me = appOnly(requireAuth(req));
    const q = parse(
      z.object({
        status: z.enum(['pending', 'delivered', 'failed']).optional(),
        after: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    let query = ctx.db.selectFrom('webhook_deliveries').selectAll().where('app_id', '=', me.id);
    if (q.status) query = query.where('status', '=', q.status);
    // Ids are time-ordered (uuidv7), so "after" is "newer than".
    if (q.after) query = query.where('id', '>', q.after).orderBy('id', 'asc');
    else query = query.orderBy('id', 'desc');
    const rows = await query.limit(q.limit).execute();
    return { deliveries: rows.map(deliveryView) };
  });

  /** A failed delivery, tried again with the whole schedule: for an endpoint that was down. */
  app.post(
    '/apps/me/deliveries/:id/retry',
    async (req): Promise<{ delivery: WebhookDeliveryView }> => {
      const me = appOnly(requireAuth(req));
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      if (!(await requeueDelivery(ctx, me.id, id)))
        throw notFound('A failed delivery of this app by that id');
      const row = await ctx.db
        .selectFrom('webhook_deliveries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return { delivery: deliveryView(row) };
    },
  );

  app.get('/orgs/:id/apps', async (req): Promise<{ apps: OrgAppView[] }> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await manager(auth.userId, id);
    const rows = await ctx.db
      .selectFrom('org_apps')
      .selectAll()
      .where('org_id', '=', id)
      .where('revoked_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return { apps: await appViews(ctx, rows) };
  });

  /** A new app: its bot joins the team, and its token and secret are shown this once. */
  app.post('/orgs/:id/apps', async (req, reply): Promise<OrgAppSecretsView> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    const body = parse(CreateOrgAppBody, req.body);
    await manager(auth.userId, id);
    ctx.limiter.hit(`apps:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    await assertAppRoom(ctx, id);
    const url = webhook(body.webhookUrl);
    const appId = uuidv7();
    const botId = uuidv7();
    const token = newApiToken();
    const secret = newWebhookSecret();
    await ctx.db.transaction().execute(async (trx) => {
      // A bot can never sign in: its address can't receive mail and no password matches '!'.
      await trx
        .insertInto('users')
        .values({
          id: botId,
          email: `bot+${botId}@bots.caime.invalid`,
          handle: `bot.${randomBytes(6).toString('hex')}`,
          password_hash: '!',
          display_name: body.name,
          kind: 'bot',
          privacy: JSON.stringify({
            ...defaultPrivacy({ minor: false }),
            discoverByHandle: false,
            discoverByEmail: false,
            messageRequests: 'nobody',
          }),
          onboarded_at: ctx.now(),
        })
        .execute();
      await trx
        .insertInto('org_apps')
        .values({
          id: appId,
          org_id: id,
          name: body.name,
          bot_user_id: botId,
          scopes: body.scopes,
          webhook_url: url,
          webhook_secret: secret,
          events: body.events,
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('api_tokens')
        .values({ id: uuidv7(), app_id: appId, prefix: token.prefix, token_hash: token.hash })
        .execute();
      await trx
        .insertInto('org_members')
        .values({ org_id: id, user_id: botId, role: 'agent', title: 'App', added_by: auth.userId })
        .execute();
    });
    await joinThreads(ctx.db, id, botId);
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'app.created',
      target: appId,
      metadata: { orgId: id, scopes: body.scopes, events: body.events },
    });
    reply.status(201);
    return {
      app: await viewOf(await appOf(id, appId)),
      token: token.token,
      webhookSecret: secret,
    };
  });

  app.patch('/orgs/:id/apps/:appId', async (req): Promise<{ app: OrgAppView }> => {
    const auth = requireAuth(req);
    const { id, appId } = parse(appParam, req.params);
    const body = parse(UpdateOrgAppBody, req.body);
    await manager(auth.userId, id);
    const found = await appOf(id, appId);
    await ctx.db
      .updateTable('org_apps')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.scopes !== undefined ? { scopes: body.scopes } : {}),
        ...(body.webhookUrl !== undefined ? { webhook_url: webhook(body.webhookUrl) } : {}),
        ...(body.events !== undefined ? { events: body.events } : {}),
      })
      .where('id', '=', appId)
      .execute();
    if (body.name !== undefined && found.bot_user_id)
      await ctx.db
        .updateTable('users')
        .set({ display_name: body.name, updated_at: ctx.now() })
        .where('id', '=', found.bot_user_id)
        .execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'app.updated',
      target: appId,
      metadata: { fields: Object.keys(body) },
    });
    return { app: await viewOf(await appOf(id, appId)) };
  });

  /** A new token; the old one stops working at once. */
  app.post('/orgs/:id/apps/:appId/token', async (req): Promise<OrgAppSecretsView> => {
    const auth = requireAuth(req);
    const { id, appId } = parse(appParam, req.params);
    await manager(auth.userId, id);
    await appOf(id, appId);
    const token = newApiToken();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('api_tokens')
        .set({ revoked_at: ctx.now() })
        .where('app_id', '=', appId)
        .where('revoked_at', 'is', null)
        .execute();
      await trx
        .insertInto('api_tokens')
        .values({ id: uuidv7(), app_id: appId, prefix: token.prefix, token_hash: token.hash })
        .execute();
    });
    await audit(ctx.db, { actorId: auth.userId, action: 'app.token_replaced', target: appId });
    return { app: await viewOf(await appOf(id, appId)), token: token.token, webhookSecret: null };
  });

  app.post('/orgs/:id/apps/:appId/secret', async (req): Promise<OrgAppSecretsView> => {
    const auth = requireAuth(req);
    const { id, appId } = parse(appParam, req.params);
    await manager(auth.userId, id);
    await appOf(id, appId);
    const secret = newWebhookSecret();
    await ctx.db
      .updateTable('org_apps')
      .set({ webhook_secret: secret })
      .where('id', '=', appId)
      .execute();
    await audit(ctx.db, { actorId: auth.userId, action: 'app.secret_replaced', target: appId });
    return { app: await viewOf(await appOf(id, appId)), token: null, webhookSecret: secret };
  });

  /** A test delivery, to see the address answers and the signature checks out. */
  app.post('/orgs/:id/apps/:appId/ping', async (req) => {
    const auth = requireAuth(req);
    const { id, appId } = parse(appParam, req.params);
    await manager(auth.userId, id);
    const found = await appOf(id, appId);
    if (!found.webhook_url) throw notFound('A webhook address for that app');
    return { deliveryId: await queueDelivery(ctx, appId, id, 'ping', { appId }) };
  });

  app.get(
    '/orgs/:id/apps/:appId/deliveries',
    async (req): Promise<{ deliveries: WebhookDeliveryView[] }> => {
      const auth = requireAuth(req);
      const { id, appId } = parse(appParam, req.params);
      await manager(auth.userId, id);
      await appOf(id, appId);
      const rows = await ctx.db
        .selectFrom('webhook_deliveries')
        .selectAll()
        .where('app_id', '=', appId)
        .orderBy('created_at', 'desc')
        .limit(20)
        .execute();
      return { deliveries: rows.map(deliveryView) };
    },
  );

  /** Removed: its token and webhook stop at once, and its bot leaves the team. */
  app.delete('/orgs/:id/apps/:appId', async (req) => {
    const auth = requireAuth(req);
    const { id, appId } = parse(appParam, req.params);
    await manager(auth.userId, id);
    const found = await appOf(id, appId);
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('org_apps')
        .set({ revoked_at: ctx.now() })
        .where('id', '=', appId)
        .execute();
      await trx
        .updateTable('api_tokens')
        .set({ revoked_at: ctx.now() })
        .where('app_id', '=', appId)
        .where('revoked_at', 'is', null)
        .execute();
      if (found.bot_user_id) {
        await trx
          .updateTable('org_members')
          .set({ left_at: ctx.now() })
          .where('org_id', '=', id)
          .where('user_id', '=', found.bot_user_id)
          .execute();
        await leaveThreads(trx, id, found.bot_user_id, ctx.now());
      }
    });
    await audit(ctx.db, { actorId: auth.userId, action: 'app.revoked', target: appId });
    return { ok: true };
  });
}
