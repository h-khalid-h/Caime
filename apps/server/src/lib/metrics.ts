/**
 * Operational metrics (PRD §81) in Prometheus's text format, served at GET /metrics behind
 * METRICS_TOKEN. Counts and timings only: never a message, a name, an id, a handle or a query.
 * Every label value comes from a fixed set (a route as declared, not as requested; a kind; an
 * outcome), so no request can mint a new series. Per instance, as Prometheus expects: its
 * scraper adds the instance.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type pg from 'pg';

type Labels = Record<string, string>;
type Sample = { labels: Labels; value: number };

const escapeLabel = (v: string) =>
  v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelText = (labels: Labels) => {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(labels[k] ?? '')}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
};
const keyOf = (labels: Labels) => labelText(labels);

abstract class Family {
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge' | 'histogram',
  ) {}
  abstract lines(): string[];
  render(): string {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`, ...this.lines()]
      .join('\n')
      .concat('\n');
  }
}

export class Counter extends Family {
  private samples = new Map<string, Sample>();
  constructor(name: string, help: string) {
    super(name, help, 'counter');
  }
  inc(labels: Labels = {}, by = 1): void {
    const key = keyOf(labels);
    const s = this.samples.get(key);
    if (s) s.value += by;
    else this.samples.set(key, { labels, value: by });
  }
  get(labels: Labels = {}): number {
    return this.samples.get(keyOf(labels))?.value ?? 0;
  }
  lines(): string[] {
    return [...this.samples.values()].map((s) => `${this.name}${labelText(s.labels)} ${s.value}`);
  }
}

export class Gauge extends Family {
  private samples = new Map<string, Sample>();
  constructor(
    name: string,
    help: string,
    private readonly collect?: () => Sample[],
  ) {
    super(name, help, 'gauge');
  }
  set(labels: Labels, value: number): void {
    this.samples.set(keyOf(labels), { labels, value });
  }
  inc(labels: Labels = {}, by = 1): void {
    const key = keyOf(labels);
    const s = this.samples.get(key);
    if (s) s.value += by;
    else this.samples.set(key, { labels, value: by });
  }
  dec(labels: Labels = {}, by = 1): void {
    this.inc(labels, -by);
  }
  lines(): string[] {
    const samples = this.collect ? this.collect() : [...this.samples.values()];
    return samples.map((s) => `${this.name}${labelText(s.labels)} ${s.value}`);
  }
}

export class Histogram extends Family {
  private series = new Map<string, { labels: Labels; counts: number[]; sum: number; n: number }>();
  constructor(
    name: string,
    help: string,
    private readonly buckets: number[],
  ) {
    super(name, help, 'histogram');
  }
  observe(labels: Labels, value: number): void {
    const key = keyOf(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { labels, counts: this.buckets.map(() => 0), sum: 0, n: 0 };
      this.series.set(key, s);
    }
    for (const [i, le] of this.buckets.entries())
      if (value <= le) s.counts[i] = (s.counts[i] ?? 0) + 1;
    s.sum += value;
    s.n += 1;
  }
  lines(): string[] {
    return [...this.series.values()].flatMap((s) => [
      ...this.buckets.map(
        (le, i) =>
          `${this.name}_bucket${labelText({ ...s.labels, le: String(le) })} ${s.counts[i]}`,
      ),
      `${this.name}_bucket${labelText({ ...s.labels, le: '+Inf' })} ${s.n}`,
      `${this.name}_sum${labelText(s.labels)} ${Number(s.sum.toFixed(6))}`,
      `${this.name}_count${labelText(s.labels)} ${s.n}`,
    ]);
  }
}

const SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * The last database backup that succeeded (lib/backup.ts writes it): when, how big, and whether
 * it was encrypted with BACKUP_KEY (M16 B5).
 */
export const backupState = { at: 0, bytes: 0, copiedAt: 0, encrypted: false };

/**
 * Connected accounts' sealed tokens (M16 B5, lib/vault-reseal.ts writes it): whether VAULT_KEY
 * seals on this instance, and at the last pass, how many are sealed with which key and whether the
 * database still holds its own (`at` 0 until a pass ran).
 */
export const vaultState = {
  external: false,
  sealing: 0,
  older: 0,
  unopenable: 0,
  databaseKey: false,
  at: 0,
};

/** The audit chain's last check (lib/audit.ts writes it): when, whether it held, its head. */
export const auditState = { checkedAt: 0, ok: true, headSeq: 0 };

/** A provider's last probe (lib/provider-health.ts writes them), by its fixed id. */
export interface ProviderHealth {
  up: boolean;
  latencyMs: number;
  checkedAt: number;
  error: string | null;
}
export const providerState = new Map<string, ProviderHealth>();

/** What the server measures about itself. One per app, so tests don't share counts. */
export function createMetrics(pool: pg.Pool) {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const started = Date.now();
  const m = {
    http: new Counter('caime_http_requests_total', 'HTTP requests, by route and status.'),
    httpSeconds: new Histogram(
      'caime_http_request_duration_seconds',
      'Time to answer an HTTP request, by route.',
      SECONDS,
    ),
    realtime: new Gauge('caime_realtime_connections', 'Open realtime connections.'),
    messages: new Counter('caime_messages_total', 'Messages sent, by kind.'),
    // Booking before an account (R97 (1)): each step's outcome, refusals by their reason.
    publicBookings: new Counter(
      'caime_public_bookings_total',
      'Bookings before an account, by outcome (a code sent, booked, or why not).',
    ),
    // Writing to an organization before an account (R97 (1), M16 C1d): each step's outcome.
    publicWrites: new Counter(
      'caime_public_writes_total',
      'Messages to an organization before an account, by outcome (a code sent, written, or why not).',
    ),
    // Notice and action (R49, M16 B6): reports made, by who made them and why, and appeals of a
    // suspension, by step, so an alert can say one is waiting.
    reports: new Counter(
      'caime_reports_total',
      'Reports made, by who made them (person, visitor) and their reason.',
    ),
    appeals: new Counter(
      'caime_appeals_total',
      'Appeals of a suspension, by outcome (made, lifted, upheld).',
    ),
    // Age assurance (M16 B7): checks begun, and what they found, by provider.
    ageChecks: new Counter(
      'caime_age_checks_total',
      'Age checks begun and answered, by provider and outcome (started, adult, minor, failed).',
    ),
    // Work after a response (M16 D2a): what runs and waits on this instance, and what failed.
    deferred: new Gauge(
      'caime_deferred',
      'Work after a response on this instance, by state (running, waiting).',
    ),
    deferredFailed: new Counter(
      'caime_deferred_failed_total',
      'Work after a response that failed, by its label (a name in the code).',
    ),
    // Set as /metrics is scraped: what waits on the operator, and for how long.
    moderationWaiting: new Gauge(
      'caime_moderation_waiting',
      'What waits on the operator, by kind (report, child_safety, appeal).',
    ),
    moderationOldestSeconds: new Gauge(
      'caime_moderation_oldest_seconds',
      'How long the longest-waiting report or appeal has waited, by kind.',
    ),
    // People onto a team (M16 C3a, C3b): by an invite, or by an address at its verified domain.
    teamJoins: new Counter(
      'caime_team_joins_total',
      'People who joined a team, by how (invite, domain).',
    ),
    // Join links (M16 C3e): made, and joined through, by group or space.
    joinLinks: new Counter(
      'caime_join_links_total',
      'Join links made and joined through, by target (group, space) and outcome.',
    ),
    // Links to files (M16 H6): made, their pages opened, the files downloaded or previewed.
    fileLinks: new Counter(
      'caime_file_links_total',
      'Links to files made, and their pages opened and files fetched, by outcome.',
    ),
    // A file read as a page (M16 H6): shown, or unreadable.
    fileViews: new Counter('caime_file_views_total', 'Files read as pages, by kind and outcome.'),
    // The outbox (A3): what the sweep did about effects the fast path never finished.
    effects: new Counter(
      'caime_message_effects_total',
      'Message effects the sweep replayed or gave up on, by outcome.',
    ),
    // Link previews (M16 E4c): a page read, found kept, saying nothing, failing or refused.
    linkPreviews: new Counter(
      'caime_link_previews_total',
      'Link previews asked for, by outcome (read, kept, none, failed, refused).',
    ),
    mail: new Counter(
      'caime_mail_total',
      'Mail received and sent (R75), by direction and outcome.',
    ),
    jobs: new Counter('caime_jobs_total', 'Background jobs run, by kind and outcome.'),
    // Set as /metrics is scraped (modules/metrics.ts): what waits, and for how long.
    jobsQueued: new Gauge('caime_jobs_queued', 'Background jobs waiting to run, or running.'),
    jobsOldestSeconds: new Gauge(
      'caime_jobs_oldest_seconds',
      'How long the longest-waiting due job has waited.',
    ),
    jobsDead: new Gauge(
      'caime_jobs_dead',
      'Background jobs out of attempts, awaiting the operator.',
    ),
    jobSeconds: new Histogram('caime_job_duration_seconds', 'Time a job took, by kind.', SECONDS),
    webhooks: new Counter(
      'caime_webhook_deliveries_total',
      'Webhook delivery attempts, by outcome (delivered, retrying, failed).',
    ),
    ai: new Counter('caime_ai_calls_total', 'AI assist calls, by feature and outcome.'),
    aiTokens: new Counter(
      'caime_ai_tokens_total',
      'Tokens sent to the model and received from it, by feature and direction: what AI costs.',
    ),
    aiSeconds: new Histogram(
      'caime_ai_call_duration_seconds',
      'Time an AI assist call took, by feature.',
      [0.25, 0.5, 1, 2, 5, 10, 20, 40],
    ),
    push: new Counter('caime_push_total', 'Push notifications, by channel and outcome.'),
    turn: new Counter(
      'caime_turn_credentials_total',
      'Relay credentials asked of Cloudflare for calls, by outcome (issued, failed).',
    ),
  };
  const process_ = [
    new Gauge('caime_db_pool_connections', 'Database connections, by state.', () => [
      { labels: { state: 'total' }, value: pool.totalCount },
      { labels: { state: 'idle' }, value: pool.idleCount },
      { labels: { state: 'waiting' }, value: pool.waitingCount },
    ]),
    new Gauge('process_resident_memory_bytes', 'Resident memory.', () => [
      { labels: {}, value: process.memoryUsage().rss },
    ]),
    new Gauge('nodejs_heap_used_bytes', 'JavaScript heap in use.', () => [
      { labels: {}, value: process.memoryUsage().heapUsed },
    ]),
    new Gauge(
      'caime_backup_last_success_timestamp_seconds',
      'When the last database backup succeeded (0 when none has yet).',
      () => [{ labels: {}, value: Math.round(backupState.at / 1000) }],
    ),
    new Gauge('caime_backup_bytes', 'The size of the last database backup.', () => [
      { labels: {}, value: backupState.bytes },
    ]),
    new Gauge(
      'caime_backup_encrypted',
      'Whether the last backup was encrypted with BACKUP_KEY (absent until one was made).',
      () => (backupState.at ? [{ labels: {}, value: backupState.encrypted ? 1 : 0 }] : []),
    ),
    new Gauge(
      'caime_vault_key_external',
      'Whether VAULT_KEY seals connected accounts’ tokens on this instance (0: the database’s own key does).',
      () => [{ labels: {}, value: vaultState.external ? 1 : 0 }],
    ),
    new Gauge(
      'caime_vault_database_key',
      'Whether the database still held its own key to connected accounts’ tokens at the last pass (absent until one ran).',
      () => (vaultState.at ? [{ labels: {}, value: vaultState.databaseKey ? 1 : 0 }] : []),
    ),
    new Gauge(
      'caime_vault_sealed',
      'Connected accounts’ tokens at the last pass, by key: the one that seals now, an older one that still opens them, or one that’s gone (absent until a pass ran).',
      () =>
        vaultState.at
          ? [
              { labels: { key: 'sealing' }, value: vaultState.sealing },
              { labels: { key: 'older' }, value: vaultState.older },
              { labels: { key: 'unopenable' }, value: vaultState.unopenable },
            ]
          : [],
    ),
    new Gauge(
      'caime_backup_last_copy_timestamp_seconds',
      'When the last backup was last copied off the host (0 when no copy is configured or none has gone).',
      () => [{ labels: {}, value: Math.round(backupState.copiedAt / 1000) }],
    ),
    new Gauge(
      'caime_audit_chain_ok',
      'Whether the audit log’s hash chain held at its last check (absent until one ran).',
      () => (auditState.checkedAt ? [{ labels: {}, value: auditState.ok ? 1 : 0 }] : []),
    ),
    new Gauge('caime_audit_chain_seq', 'The audit chain’s head at its last check.', () => [
      { labels: {}, value: auditState.headSeq },
    ]),
    new Gauge(
      'caime_audit_chain_checked_timestamp_seconds',
      'When the audit chain was last checked (0 when it hasn’t been yet).',
      () => [{ labels: {}, value: Math.round(auditState.checkedAt / 1000) }],
    ),
    new Gauge(
      'caime_provider_up',
      'Whether a configured provider answered its cheapest read at the last probe, by provider.',
      () =>
        [...providerState].map(([provider, s]) => ({ labels: { provider }, value: s.up ? 1 : 0 })),
    ),
    new Gauge(
      'caime_provider_latency_seconds',
      'How long a configured provider took to answer at the last probe, by provider.',
      () =>
        [...providerState].map(([provider, s]) => ({
          labels: { provider },
          value: s.latencyMs / 1000,
        })),
    ),
    new Gauge('process_uptime_seconds', 'Seconds since this instance started.', () => [
      { labels: {}, value: Math.round((Date.now() - started) / 1000) },
    ]),
    // Since the last scrape, then reset: how late timers ran lately, not since boot.
    new Gauge('nodejs_eventloop_delay_p99_seconds', 'Event loop delay, 99th percentile.', () => {
      const p99 = loop.percentile(99) / 1e9;
      loop.reset();
      return [{ labels: {}, value: Number.isFinite(p99) ? Number(p99.toFixed(6)) : 0 }];
    }),
  ];
  return {
    ...m,
    render(): string {
      return [...Object.values(m), ...process_].map((f) => f.render()).join('');
    },
    stop(): void {
      loop.disable();
    },
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
