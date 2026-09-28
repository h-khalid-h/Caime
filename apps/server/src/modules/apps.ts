/**
 * An organization's apps (PRD §73–75, R16), managed by its owner and admins: make one (its bot
 * joins the team; its token and webhook secret are shown once), change what it may do and hear,
 * replace its token or secret, test its webhook, see its deliveries, remove it.
 */
import { randomBytes } from 'node:crypto';
import {
  CreateOrgAppBody,
  canManageOrg,
  defaultPrivacy,
  type OrgAppSecretsView,
  type OrgAppView,
  UpdateOrgAppBody,
  uuidv7,
  type WebhookDeliveryView,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { OrgApp } from '../db/schema';
import {
  appViews,
  checkWebhookUrl,
  newApiToken,
  newWebhookSecret,
  queueDelivery,
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
  const webhook = (url: string | null | undefined) =>
    url ? checkWebhookUrl(url, ctx.config.WEBHOOKS_ALLOW_PRIVATE) : null;

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
      return {
        deliveries: rows.map((d) => ({
          id: d.id,
          event: d.event,
          status: d.status,
          attempts: d.attempts,
          lastStatus: d.last_status,
          lastError: d.last_error,
          createdAt: d.created_at.toISOString(),
          deliveredAt: d.delivered_at?.toISOString() ?? null,
        })),
      };
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
