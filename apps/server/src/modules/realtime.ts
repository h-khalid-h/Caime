/**
 * Realtime (docs/ARCHITECTURE.md "Realtime protocol"; ADR-5). One WebSocket per device. Web
 * authenticates with its session cookie during the upgrade; native sends {type:"auth", token}
 * as its first frame. Events arrive from the bus, which spans every server instance.
 */
import { canSee, resolvePolicy, type Sphere } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { AppContext } from '../context';
import { loadPolicies } from '../lib/relations';
import { privacyOf } from '../lib/users';
import { resolveSession } from '../plugins/auth';

const PING_MS = 25_000;
const AUTH_TIMEOUT_MS = 10_000;

interface Client {
  socket: WebSocket;
  userId: string;
  alive: boolean;
}

export class Hub {
  private byUser = new Map<string, Set<Client>>();

  add(c: Client): boolean {
    const set = this.byUser.get(c.userId) ?? new Set();
    const first = set.size === 0;
    set.add(c);
    this.byUser.set(c.userId, set);
    return first;
  }

  remove(c: Client): boolean {
    const set = this.byUser.get(c.userId);
    if (!set) return false;
    set.delete(c);
    if (set.size === 0) {
      this.byUser.delete(c.userId);
      return true;
    }
    return false;
  }

  deliver(userIds: string[], frame: string): void {
    for (const id of userIds) {
      for (const c of this.byUser.get(id) ?? []) {
        if (c.socket.readyState === c.socket.OPEN) c.socket.send(frame);
      }
    }
  }

  online(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  all(): Client[] {
    return [...this.byUser.values()].flatMap((s) => [...s]);
  }

  get size(): number {
    return this.all().length;
  }
}

/** Tell the people who may see it that this user came online or went offline. */
async function broadcastPresence(
  ctx: AppContext,
  userId: string,
  state: 'online' | 'offline',
): Promise<void> {
  const me = await ctx.db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!me || me.presence === 'invisible') return;
  const counterparts = await ctx.db
    .selectFrom('connection_sides as s')
    .innerJoin('connections as c', 'c.id', 's.connection_id')
    .select(['s.other_id', 'c.id as connection_id'])
    .where('s.owner_id', '=', userId)
    .where('c.status', '=', 'active')
    .limit(1000)
    .execute();
  if (counterparts.length === 0) return;
  const [rels, policies, blocks] = await Promise.all([
    ctx.db
      .selectFrom('relationships')
      .select(['subject_id', 'sphere', 'role', 'org_id', 'is_primary'])
      .where('owner_id', '=', userId)
      .where('status', '=', 'active')
      .where(
        'subject_id',
        'in',
        counterparts.map((c) => c.other_id),
      )
      .orderBy('is_primary', 'desc')
      .execute(),
    loadPolicies(ctx.db, userId),
    ctx.db
      .selectFrom('blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) => eb.or([eb('blocker_id', '=', userId), eb('blocked_id', '=', userId)]))
      .execute(),
  ]);
  const privacy = privacyOf(me, ctx.now());
  const allowed = counterparts
    .filter((c) => {
      if (blocks.some((b) => b.blocker_id === c.other_id || b.blocked_id === c.other_id))
        return false;
      const mine = rels.filter((r) => r.subject_id === c.other_id);
      const primary = mine[0];
      const preset = resolvePolicy(policies, {
        sphere: (primary?.sphere as Sphere | undefined) ?? null,
        role: primary?.role ?? null,
        orgId: primary?.org_id ?? null,
        connectionId: c.connection_id,
      }).privacy;
      return canSee(privacy, 'onlineStatus', {
        isSelf: false,
        isConnected: true,
        blocked: false,
        ownerSpheresForViewer: mine.map((r) => r.sphere as Sphere),
        preset,
      });
    })
    .map((c) => c.other_id);
  await ctx.bus.publish(allowed, {
    type: 'presence',
    data: {
      userId,
      state: me.presence === 'busy' || me.presence === 'away' ? me.presence : state,
      at: ctx.now().toISOString(),
    },
  });
}

export async function realtimeRoutes(app: FastifyInstance, ctx: AppContext): Promise<Hub> {
  const hub = new Hub();
  ctx.bus.subscribe((msg) => {
    hub.deliver(msg.userIds, JSON.stringify({ type: 'event', event: msg.event }));
  });

  const membershipCache = new Map<string, number>();
  const isMember = async (userId: string, conversationId: string): Promise<boolean> => {
    const key = `${userId}:${conversationId}`;
    const cached = membershipCache.get(key);
    if (cached && Date.now() - cached < 60_000) return true;
    const row = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', userId)
      .where('left_at', 'is', null)
      .executeTakeFirst();
    if (row) membershipCache.set(key, Date.now());
    return Boolean(row);
  };

  const heartbeat = setInterval(() => {
    for (const c of hub.all()) {
      if (!c.alive) {
        c.socket.terminate();
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }, PING_MS);
  heartbeat.unref();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    for (const c of hub.all()) c.socket.close(1001, 'server shutting down');
  });

  app.get('/realtime', { websocket: true }, (socket, req) => {
    let client: Client | null = null;

    const attach = async (userId: string) => {
      client = { socket, userId, alive: true };
      socket.on('pong', () => {
        if (client) client.alive = true;
      });
      const first = hub.add(client);
      await ctx.db
        .updateTable('users')
        .set({ last_active_at: ctx.now() })
        .where('id', '=', userId)
        .execute();
      socket.send(JSON.stringify({ type: 'hello', userId, serverTime: ctx.now().toISOString() }));
      if (first) ctx.defer('presence', () => broadcastPresence(ctx, userId, 'online'));
    };

    const timer = setTimeout(() => {
      if (!client) socket.close(4401, 'authentication required');
    }, AUTH_TIMEOUT_MS);

    if (req.auth) {
      clearTimeout(timer);
      void attach(req.auth.userId);
    }

    socket.on('message', async (raw) => {
      let msg: { type?: string; token?: string; conversationId?: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!client) {
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const session = await resolveSession(ctx, msg.token);
          if (!session) return socket.close(4401, 'invalid session');
          clearTimeout(timer);
          await attach(session.userId);
        }
        return;
      }
      const userId = (client as Client).userId;
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', serverTime: ctx.now().toISOString() }));
        return;
      }
      if (msg.type === 'active') {
        await ctx.db
          .updateTable('users')
          .set({ last_active_at: ctx.now() })
          .where('id', '=', userId)
          .execute();
        return;
      }
      if (msg.type === 'typing' && typeof msg.conversationId === 'string') {
        try {
          ctx.limiter.hit(`typing:${userId}:${msg.conversationId}`, 30, 60_000);
        } catch {
          return;
        }
        if (!(await isMember(userId, msg.conversationId))) return;
        const members = await ctx.db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', msg.conversationId)
          .where('left_at', 'is', null)
          .where('user_id', '<>', userId)
          .execute();
        await ctx.bus.publish(
          members.map((m) => m.user_id),
          { type: 'typing', data: { conversationId: msg.conversationId, userId } },
        );
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!client) return;
      const last = hub.remove(client);
      const userId = client.userId;
      if (last) {
        ctx.defer('presence', async () => {
          await ctx.db
            .updateTable('users')
            .set({ last_active_at: ctx.now() })
            .where('id', '=', userId)
            .execute();
          await broadcastPresence(ctx, userId, 'offline');
        });
      }
    });
  });

  return hub;
}
