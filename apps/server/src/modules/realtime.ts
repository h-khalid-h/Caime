/**
 * Realtime (docs/ARCHITECTURE.md "Realtime protocol"; ADR-5). One WebSocket per device. Web
 * authenticates with its session cookie during the upgrade; native sends {type:"auth", token}
 * as its first frame. Events arrive from the bus, which spans every server instance.
 */
import { canSee, resolvePolicy, type Sphere } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { AppContext } from '../context';
import { assertCanWrite } from '../lib/blocks';
import { loadPolicies } from '../lib/relations';
import { SESSION_ENDED, type SessionEndedData } from '../lib/sessions';
import { privacyOf } from '../lib/users';
import { resolveSession } from '../plugins/auth';

const PING_MS = 25_000;
const AUTH_TIMEOUT_MS = 10_000;

/**
 * What a device may send. Anything else is dropped where it lands: a frame is the one input a
 * signed-in device gives this process directly, so a shape it didn't expect must never reach a
 * query (a non-uuid in a uuid column throws) or anything that could take the process down.
 */
const Frame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1).max(512) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('active') }),
  z.object({ type: z.literal('typing'), conversationId: z.string().uuid() }),
]);

interface Client {
  socket: WebSocket;
  userId: string;
  /** The session this socket was opened with: closed when that session ends. */
  sessionId: string;
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

  /** Close every socket a now-ended session holds (sign-out, revocation, suspension). */
  closeSessions(userId: string, sessionIds: string[]): number {
    let closed = 0;
    for (const c of this.byUser.get(userId) ?? []) {
      if (!sessionIds.includes(c.sessionId)) continue;
      c.socket.close(4401, 'session ended');
      closed += 1;
    }
    return closed;
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
    if (msg.event.type === SESSION_ENDED) {
      // For the hub alone, on every instance: the sockets of a session that ended go now.
      const { sessionIds } = msg.event.data as SessionEndedData;
      for (const userId of msg.userIds) hub.closeSessions(userId, sessionIds);
      return;
    }
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
    // The membership cache forgets what it hasn't seen for a minute, so it never grows past
    // what's typing now.
    const stale = Date.now() - 60_000;
    for (const [key, at] of membershipCache) if (at < stale) membershipCache.delete(key);
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

  // Browsers send the session cookie with any WebSocket handshake to this host, so a cookie
  // session must come from the app's own origin (cross-site WebSocket hijacking).
  const allowedOrigins = new Set([
    new URL(ctx.config.PUBLIC_URL).origin,
    ...ctx.config.corsOrigins,
  ]);

  app.get('/realtime', { websocket: true }, (socket, req) => {
    let client: Client | null = null;
    const origin = req.headers.origin;
    if (req.auth?.via === 'cookie' && origin && !allowedOrigins.has(origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }

    const attach = async (userId: string, sessionId: string) => {
      client = { socket, userId, sessionId, alive: true };
      socket.on('pong', () => {
        if (client) client.alive = true;
      });
      const first = hub.add(client);
      ctx.metrics.realtime.inc();
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

    // A handler that rejects would end the process (Node's default for an unhandled rejection
    // from an async listener), so every failure stops at this socket.
    const failed = (what: string) => (err: unknown) => {
      req.log.warn({ err }, `realtime: ${what} failed`);
      socket.close(1011, 'server error');
    };

    if (req.auth) {
      clearTimeout(timer);
      attach(req.auth.userId, req.auth.sessionId).catch(failed('attach'));
    }

    const handle = async (raw: unknown) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const read = Frame.safeParse(parsed);
      if (!read.success) return;
      const msg = read.data;
      if (!client) {
        if (msg.type === 'auth') {
          const session = await resolveSession(ctx, msg.token);
          if (!session) return socket.close(4401, 'invalid session');
          clearTimeout(timer);
          await attach(session.userId, session.sessionId);
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
      if (msg.type === 'typing') {
        try {
          ctx.limiter.hit(`typing:${userId}:${msg.conversationId}`, 30, 60_000);
        } catch {
          return;
        }
        if (!(await isMember(userId, msg.conversationId))) return;
        // Typing reaches the other side too: not past a block (PRD §55).
        try {
          await assertCanWrite(ctx, msg.conversationId, userId);
        } catch {
          return;
        }
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
    };
    socket.on('message', (raw) => {
      handle(raw).catch(failed('message'));
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!client) return;
      ctx.metrics.realtime.dec();
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
