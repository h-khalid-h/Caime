/**
 * Realtime fan-out across server instances through Postgres LISTEN/NOTIFY (ADR-5). Every
 * instance, including the sender, receives every message and delivers to the sockets it holds.
 * Payloads over the NOTIFY limit travel by reference to `domain_events`.
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

const CHANNEL = 'caishy_realtime';
const MAX_INLINE = 7000;

export class Bus {
  private handlers = new Set<Handler>();
  private listener: pg.PoolClient | null = null;
  private closed = false;

  constructor(private readonly pool: pg.Pool) {}

  async start(): Promise<void> {
    const client = await this.pool.connect();
    this.listener = client;
    client.on('notification', (n) => {
      if (n.channel !== CHANNEL || !n.payload) return;
      void this.dispatch(n.payload);
    });
    client.on('error', () => {
      // The listening connection dropped (database restart). Reconnect after a short pause.
      this.listener = null;
      if (!this.closed) setTimeout(() => void this.start().catch(() => {}), 1000);
    });
    await client.query(`listen ${CHANNEL}`);
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
    const msg: BusMessage = { userIds: unique, event };
    let payload = JSON.stringify(msg);
    if (payload.length > MAX_INLINE) {
      const row = await this.pool.query<{ id: string }>(
        `insert into domain_events (type, payload) values ('realtime.large', $1) returning id`,
        [msg],
      );
      payload = JSON.stringify({ ref: row.rows[0]!.id });
    }
    await this.pool.query('select pg_notify($1, $2)', [CHANNEL, payload]);
  }

  async stop(): Promise<void> {
    this.closed = true;
    if (this.listener) {
      await this.listener.query(`unlisten ${CHANNEL}`).catch(() => {});
      this.listener.release();
      this.listener = null;
    }
  }
}
