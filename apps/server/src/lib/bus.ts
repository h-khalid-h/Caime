/**
 * Realtime fan-out across server instances through Postgres LISTEN/NOTIFY (ADR-5). Every
 * instance, including the sender, receives every message and delivers to the sockets it holds.
 * Payloads over the NOTIFY limit travel by reference to `domain_events`.
 *
 * The listening connection is the one thing here that can be lost (a database restart, a
 * failover): it is made again with a backoff that never gives up while the bus is open (review
 * 2026-10-17 §4 H1: one try after a second, swallowed, left every socket on the instance deaf
 * for good), the lost client is destroyed rather than returned to the pool, `healthy()` says
 * whether the instance can hear (readyz reads it), and whoever asks (`onReconnect`) is told
 * when it can again, so the sockets are sent a `resync` and catch up on what was missed.
 */
import type pg from 'pg';

export interface RealtimeEvent {
  type: string;
  data: unknown;
}

export interface BusMessage {
  userIds: string[];
  event: RealtimeEvent;
}

type Handler = (msg: BusMessage) => void;
/** A last step before delivery that may split the recipients (the business mask, R15). */
export type BusTransform = (
  userIds: string[],
  event: RealtimeEvent,
) => Promise<Array<[string[], RealtimeEvent]>>;

const CHANNEL = 'caime_realtime';
const MAX_INLINE = 7000;
/** The first wait before listening again, doubled each failure up to the longest. */
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export class Bus {
  private handlers = new Set<Handler>();
  private listener: pg.PoolClient | null = null;
  private closed = false;
  /** Other channels this instance listens on (the job queue's wake-up), by name. */
  private channels = new Map<string, Set<(payload: string) => void>>();
  private reconnectHooks = new Set<() => void>();
  private retryMs = FIRST_RETRY_MS;
  private retryTimer: NodeJS.Timeout | null = null;
  /** How many times the listening connection was lost and made again. */
  reconnects = 0;
  /** Why the connection was last lost or couldn't be made; null while it listens. */
  lastError: string | null = null;
  transform: BusTransform | null = null;

  constructor(private readonly pool: pg.Pool) {}

  async start(): Promise<void> {
    await this.listen(false);
  }

  /** Whether this instance hears the bus now. */
  healthy(): boolean {
    return this.listener !== null;
  }

  /** Told each time the connection is made again after being lost; returns the way to stop. */
  onReconnect(fn: () => void): () => void {
    this.reconnectHooks.add(fn);
    return () => this.reconnectHooks.delete(fn);
  }

  /** The listening connection's backend, for a test that ends it. */
  async backendPid(): Promise<number | null> {
    if (!this.listener) return null;
    const r = await this.listener.query<{ pid: number }>('select pg_backend_pid() as pid');
    return r.rows[0]?.pid ?? null;
  }

  private async listen(again: boolean): Promise<void> {
    const client = await this.pool.connect();
    let lost = false;
    const onLost = (err?: Error) => {
      if (lost) return;
      lost = true;
      this.lastError = err?.message ?? 'connection closed';
      if (this.listener === client) this.listener = null;
      // Destroyed, never returned: the pool must not hand a dead connection to a query.
      client.removeAllListeners('notification');
      client.release(err ?? new Error(this.lastError));
      if (!this.closed) this.scheduleRetry();
    };
    client.on('error', onLost);
    client.on('end', () => onLost());
    client.on('notification', (n) => {
      if (n.channel === CHANNEL) {
        if (n.payload) void this.dispatch(n.payload);
        return;
      }
      for (const fn of this.channels.get(n.channel) ?? []) fn(n.payload ?? '');
    });
    try {
      await client.query(`listen ${CHANNEL}`);
      // Whatever else was being listened for survives a reconnect.
      for (const channel of this.channels.keys()) await client.query(`listen ${channel}`);
    } catch (err) {
      onLost(err as Error);
      throw err;
    }
    this.listener = client;
    this.retryMs = FIRST_RETRY_MS;
    this.lastError = null;
    if (again) {
      this.reconnects += 1;
      for (const fn of this.reconnectHooks) fn();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.closed) return;
    const wait = this.retryMs;
    this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.listen(true).catch((err: Error) => {
        // The database is still away (connecting failed before any client existed): again later.
        this.lastError = err.message;
        if (!this.closed) this.scheduleRetry();
      });
    }, wait);
    this.retryTimer.unref?.();
  }

  /**
   * Hear a plain Postgres NOTIFY on `channel` (a name of letters and underscores), on this
   * instance's one listening connection. Returns the way to stop.
   */
  async onNotify(channel: string, fn: (payload: string) => void): Promise<() => void> {
    if (!/^[a-z_][a-z0-9_]*$/.test(channel)) throw new Error(`bad channel: ${channel}`);
    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
      if (this.listener) await this.listener.query(`listen ${channel}`);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) {
        this.channels.delete(channel);
        if (this.listener) void this.listener.query(`unlisten ${channel}`).catch(() => {});
      }
    };
  }

  private async dispatch(payload: string): Promise<void> {
    let msg: BusMessage | { ref: string };
    try {
      msg = JSON.parse(payload);
    } catch {
      return;
    }
    if ('ref' in msg) {
      const row = await this.pool.query<{ payload: BusMessage }>(
        'select payload from domain_events where id = $1',
        [msg.ref],
      );
      const full = row.rows[0]?.payload;
      if (!full) return;
      msg = full;
    }
    for (const h of this.handlers) h(msg as BusMessage);
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(userIds: string[], event: RealtimeEvent): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    const parts = this.transform ? await this.transform(unique, event) : [[unique, event] as const];
    for (const [ids, ev] of parts) if (ids.length) await this.send({ userIds: ids, event: ev });
  }

  private async send(msg: BusMessage): Promise<void> {
    let payload = JSON.stringify(msg);
    // NOTIFY's limit is in bytes: an Arabic payload is longer than its character count.
    if (Buffer.byteLength(payload, 'utf8') > MAX_INLINE) {
      const row = await this.pool.query<{ id: string }>(
        `insert into domain_events (type, payload) values ('realtime.large', $1) returning id`,
        [msg],
      );
      payload = JSON.stringify({ ref: row.rows[0]!.id });
    }
    await this.pool.query('select pg_notify($1, $2)', [CHANNEL, payload]);
  }

  /**
   * A large payload is kept only until every instance has read it (well under a second), not
   * for good: a call's offers, say, carry both people's devices and addresses.
   */
  async sweep(): Promise<void> {
    await this.pool.query(
      `delete from domain_events where type = 'realtime.large' and created_at < now() - interval '10 minutes'`,
    );
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const client = this.listener;
    if (client) {
      this.listener = null;
      // Closing on purpose: its end is nobody's loss.
      client.removeAllListeners('error');
      client.removeAllListeners('end');
      client.removeAllListeners('notification');
      await client.query(`unlisten ${CHANNEL}`).catch(() => {});
      for (const channel of this.channels.keys())
        await client.query(`unlisten ${channel}`).catch(() => {});
      client.release();
    }
  }
}
