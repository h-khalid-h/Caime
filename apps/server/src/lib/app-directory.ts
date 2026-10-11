/**
 * Apps (R74): Discover's rows and Connected's, read in one place for the directory, the
 * developer's view and the operator's queue. A listed app is an `oauth_clients` row that asked
 * (`listed_at`) and was let through (`reviewed_at` without `declined_reason`); its place in
 * Discover is by how many connected it (`connected_count`, kept on the row by the grant's own
 * transaction, never counted on read), then by newness. Caime's own built-ins
 * (`BUILTIN_APPS`) and the bridges (`BRIDGES`, R79) are rows too, first on the first page,
 * connected through their own routes.
 */
import {
  type AppCategory,
  type AppListingReviewView,
  type AppListingView,
  type AppPublisher,
  appIconPath,
  BRIDGE_DESCRIPTION,
  BRIDGES,
  BUILTIN_APPS,
  type BuiltinAppId,
  type ConnectedAppView,
  type DirectoryAppView,
  directoryCursor,
  type ListingState,
  type OrgListingView,
  parseDirectoryCursor,
  tr,
} from '@caime/core';
import { type Selectable, sql } from 'kysely';
import type { AppContext } from '../context';
import type { OAuthClientsTable } from '../db/schema';
import { escapeLike } from './text';

type ClientRow = Selectable<OAuthClientsTable>;

/** Where a listing stands, from its three marks. */
export function listingState(c: Pick<ClientRow, 'listed_at' | 'reviewed_at' | 'declined_reason'>) {
  if (!c.listed_at) return 'none' as const;
  if (!c.reviewed_at) return 'waiting' as const;
  return (c.declined_reason ? 'declined' : 'listed') as ListingState;
}

export function listingView(c: ClientRow): AppListingView {
  return {
    state: listingState(c),
    tagline: c.tagline,
    description: c.description,
    category: (c.category as AppCategory | null) ?? null,
    iconFileId: c.icon_file_id,
    loginUrl: c.login_url,
    orgId: c.org_id,
    declinedReason: c.declined_reason,
    askedAt: c.listed_at?.toISOString() ?? null,
    revision: c.listing_rev,
  };
}

/** A listed app with who published it, and whether the viewer connected it. */
export interface DirectoryRow extends ClientRow {
  owner_name: string;
  owner_handle: string;
  org_name: string | null;
  org_handle: string | null;
  org_verified_at: Date | null;
  grant_id: string | null;
}

/** The columns a publisher is read from: the owner, and the organization it's under if any. */
export type PublisherRow = Pick<
  DirectoryRow,
  'owner_name' | 'owner_handle' | 'org_name' | 'org_handle' | 'org_verified_at'
>;

/**
 * Who made an app, the same on the consent screen, in Connected and in Discover (review
 * 2026-10-09 M8): the open organization it's published under, else its developer.
 */
export function publisherOf(r: PublisherRow): AppPublisher {
  return r.org_name
    ? { kind: 'org', name: r.org_name, handle: r.org_handle, verified: r.org_verified_at !== null }
    : { kind: 'person', name: r.owner_name, handle: r.owner_handle, verified: false };
}

/** Caime, as the publisher of its own built-ins. */
export const CAIME_PUBLISHER: AppPublisher = {
  kind: 'caime',
  name: 'Caime',
  handle: null,
  verified: true,
};

export function directoryAppView(r: DirectoryRow): DirectoryAppView {
  return {
    id: r.id,
    kind: 'oauth',
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    category: (r.category as AppCategory | null) ?? 'other',
    iconUrl: appIconPath(r.id, r.icon_file_id),
    website: r.website,
    publisher: publisherOf(r),
    connectedCount: r.connected_count,
    connectUrl: r.login_url,
    connected: r.grant_id !== null,
  };
}

/** The listed apps with their publishers, joined to the viewer's own grants. */
export function directoryQuery(ctx: AppContext, viewerId: string) {
  return (
    ctx.db
      .selectFrom('oauth_clients as c')
      .innerJoin('users as u', 'u.id', 'c.owner_id')
      .leftJoin('organizations as o', (join) =>
        join.onRef('o.id', '=', 'c.org_id').on('o.archived_at', 'is', null),
      )
      .leftJoin('oauth_grants as g', (join) =>
        join
          .onRef('g.client_id', '=', 'c.id')
          .on('g.user_id', '=', viewerId)
          .on('g.revoked_at', 'is', null),
      )
      .selectAll('c')
      .select([
        'u.display_name as owner_name',
        'u.handle as owner_handle',
        'o.name as org_name',
        'o.handle as org_handle',
        'o.verified_at as org_verified_at',
        'g.id as grant_id',
      ])
      .where('c.revoked_at', 'is', null)
      // A suspended developer's apps leave the directory with them.
      .where('u.suspended_at', 'is', null)
  );
}

/** Only what's listed: asked for, let through, not declined. */
export const listed = <Q extends ReturnType<typeof directoryQuery>>(q: Q) =>
  q
    .where('c.listed_at', 'is not', null)
    .where('c.reviewed_at', 'is not', null)
    .where('c.declined_reason', 'is', null);

/**
 * A page of Discover: the most connected first, then the newest, from the cursor; a search
 * matches the name or tagline (the trigram index carries it), a category narrows it.
 */
export async function discoverPage(
  ctx: AppContext,
  viewerId: string,
  query: { before?: string; q?: string; category?: AppCategory; limit: number },
): Promise<{ apps: DirectoryAppView[]; nextBefore: string | null }> {
  const cursor = query.before ? parseDirectoryCursor(query.before) : null;
  const q = query.q?.trim();
  const rows = (await listed(directoryQuery(ctx, viewerId))
    .$if(Boolean(cursor), (qb) =>
      qb.where(
        sql<boolean>`(c.connected_count, c.id) < (${cursor?.connectedCount}, ${cursor?.id}::uuid)`,
      ),
    )
    .$if(Boolean(q), (qb) =>
      qb.where(sql`(c.name || ' ' || coalesce(c.tagline, ''))`, 'ilike', `%${escapeLike(q!)}%`),
    )
    .$if(Boolean(query.category), (qb) => qb.where('c.category', '=', query.category as string))
    .orderBy('c.connected_count', 'desc')
    .orderBy('c.id', 'desc')
    .limit(query.limit + 1)
    .execute()) as DirectoryRow[];
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    apps: page.map(directoryAppView),
    nextBefore:
      rows.length > query.limit && last ? directoryCursor(last.connected_count, last.id) : null,
  };
}

/** One listed app, or the viewer's own whatever its state (a developer sees their own listing). */
export async function directoryApp(
  ctx: AppContext,
  viewerId: string,
  id: string,
): Promise<DirectoryAppView | null> {
  const row = (await directoryQuery(ctx, viewerId)
    .where('c.id', '=', id)
    .where((eb) =>
      eb.or([
        eb('c.owner_id', '=', viewerId),
        eb.and([
          eb('c.listed_at', 'is not', null),
          eb('c.reviewed_at', 'is not', null),
          eb('c.declined_reason', 'is', null),
        ]),
      ]),
    )
    .executeTakeFirst()) as DirectoryRow | undefined;
  return row ? directoryAppView(row) : null;
}

/** A built-in or a bridge as the viewer has it: on since when, last used, and (a bridge) what it may do. */
export interface BuiltinOn {
  createdAt: string;
  lastUsedAt: string | null;
  scopes: string[];
}
export type BuiltinRow = DirectoryAppView & { kind: 'builtin' | 'bridge'; on: BuiltinOn | null };

/**
 * Caime's own apps, as Discover and Connected show them: whether each is on for the viewer,
 * and how many have it on, from the one table each keeps (the calendar address from
 * `calendar_feeds`, a bridge from its token in `personal_tokens`, R79). A new built-in adds
 * its case here.
 */
export async function builtinApps(ctx: AppContext, viewerId: string): Promise<BuiltinRow[]> {
  const [feed, tokens, counts] = await Promise.all([
    ctx.db
      .selectFrom('calendar_feeds')
      .select(['created_at', 'last_read_at'])
      .where('user_id', '=', viewerId)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('personal_tokens')
      .select(['bridge', 'scopes', 'created_at', 'last_used_at'])
      .where('user_id', '=', viewerId)
      .where('bridge', 'is not', null)
      .where('revoked_at', 'is', null)
      .execute(),
    builtinCounts(ctx),
  ]);
  const on: Record<BuiltinAppId, BuiltinOn | null> = {
    calendar: feed
      ? {
          createdAt: feed.created_at.toISOString(),
          lastUsedAt: feed.last_read_at?.toISOString() ?? null,
          scopes: [],
        }
      : null,
  };
  const own: BuiltinRow[] = BUILTIN_APPS.map((b) => ({
    id: b.id,
    kind: 'builtin' as const,
    name: tr(b.name),
    tagline: tr(b.tagline),
    description: tr(b.description),
    category: b.category,
    iconUrl: null,
    website: null,
    publisher: CAIME_PUBLISHER,
    connectedCount: counts.feeds,
    connectUrl: null,
    connected: on[b.id] !== null,
    on: on[b.id],
  }));
  const bridges: BuiltinRow[] = BRIDGES.map((b) => {
    const t = tokens.find((k) => k.bridge === b.id);
    return {
      id: b.id,
      kind: 'bridge' as const,
      name: b.name,
      tagline: tr(b.tagline),
      description: tr(BRIDGE_DESCRIPTION, { name: b.name }),
      category: 'automation' as const,
      iconUrl: null,
      website: b.website,
      publisher: CAIME_PUBLISHER,
      connectedCount: counts.bridges[b.id] ?? 0,
      connectUrl: null,
      connected: t !== undefined,
      on: t
        ? {
            createdAt: t.created_at.toISOString(),
            lastUsedAt: t.last_used_at?.toISOString() ?? null,
            scopes: t.scopes,
          }
        : null,
    };
  });
  return [...own, ...bridges];
}

/** A built-in or a bridge that's on, as a Connected row. */
export function builtinConnectedView(b: BuiltinRow): ConnectedAppView | null {
  if (!b.on) return null;
  return {
    kind: b.kind,
    appId: b.id,
    grantId: null,
    name: b.name,
    website: b.website,
    publisher: CAIME_PUBLISHER,
    iconUrl: null,
    scopes: b.on.scopes,
    createdAt: b.on.createdAt,
    lastUsedAt: b.on.lastUsedAt,
  };
}

/** One more, or one fewer, connected it: inside the grant's own change, never counted later. */
export async function countConnected(
  db: AppContext['db'],
  clientId: string,
  delta: 1 | -1,
): Promise<void> {
  await db
    .updateTable('oauth_clients')
    .set({ connected_count: sql`greatest(0, connected_count + ${delta})` })
    .where('id', '=', clientId)
    .execute();
}

/** A listing as the operator reviews it: what it says, who asked, under which organization. */
export function listingReviewView(r: DirectoryRow): AppListingReviewView {
  return {
    id: r.id,
    name: r.name,
    website: r.website,
    listing: listingView(r),
    iconUrl: appIconPath(r.id, r.icon_file_id),
    owner: { displayName: r.owner_name, handle: r.owner_handle },
    org:
      r.org_name && r.org_handle
        ? { name: r.org_name, handle: r.org_handle, verified: r.org_verified_at !== null }
        : null,
    askedAt: (r.listed_at ?? r.created_at).toISOString(),
  };
}

/** The operator's queue: what asked to be listed and hasn't been looked at, oldest first. */
export async function waitingListings(ctx: AppContext, limit = 100): Promise<DirectoryRow[]> {
  return (await directoryQuery(ctx, NO_VIEWER)
    .where('c.listed_at', 'is not', null)
    .where('c.reviewed_at', 'is', null)
    .orderBy('c.listed_at', 'asc')
    .limit(limit)
    .execute()) as DirectoryRow[];
}

/** One listing by id for the operator, whatever its state. */
export async function listingById(ctx: AppContext, id: string): Promise<DirectoryRow | null> {
  const row = (await directoryQuery(ctx, NO_VIEWER).where('c.id', '=', id).executeTakeFirst()) as
    | DirectoryRow
    | undefined;
  return row ?? null;
}

/** A viewer nobody is, so the join to grants finds none (the operator connected nothing). */
const NO_VIEWER = '00000000-0000-0000-0000-000000000000';

/**
 * How many have each built-in and bridge on, counted once and kept until one is made or ended
 * on this instance (`builtinCountsChanged`, from those routes, a lockout and an account's
 * deletion) or a minute passes (another instance may have changed it): Discover's first page
 * reads it on every open, and a count over every feed each time was the review's L.
 */
const BUILTIN_COUNT_MS = 60_000;
interface BuiltinCounts {
  feeds: number;
  bridges: Record<string, number>;
}
const builtinCountsKept = new WeakMap<AppContext, BuiltinCounts & { until: number }>();
export function builtinCountsChanged(ctx: AppContext): void {
  builtinCountsKept.delete(ctx);
}
async function builtinCounts(ctx: AppContext): Promise<BuiltinCounts> {
  const kept = builtinCountsKept.get(ctx);
  if (kept && kept.until > Date.now()) return kept;
  const [feeds, perBridge] = await Promise.all([
    ctx.db
      .selectFrom('calendar_feeds')
      .select(sql<number>`count(*)::int`.as('n'))
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('personal_tokens')
      .select(['bridge', sql<number>`count(*)::int`.as('n')])
      .where('bridge', 'is not', null)
      .where('revoked_at', 'is', null)
      .groupBy('bridge')
      .execute(),
  ]);
  const counts: BuiltinCounts = {
    feeds: feeds.n,
    bridges: Object.fromEntries(perBridge.map((r) => [r.bridge as string, r.n])),
  };
  builtinCountsKept.set(ctx, { ...counts, until: Date.now() + BUILTIN_COUNT_MS });
  return counts;
}

/**
 * The apps published under an organization, for its owner and admins (M10): each as Discover
 * would show it, with where its listing stands and who develops it, whatever the state.
 */
export async function orgListings(ctx: AppContext, orgId: string): Promise<OrgListingView[]> {
  const rows = (await directoryQuery(ctx, NO_VIEWER)
    .where('c.org_id', '=', orgId)
    .orderBy('c.created_at', 'desc')
    .limit(100)
    .execute()) as DirectoryRow[];
  return rows.map((r) => ({
    app: directoryAppView(r),
    listing: listingState(r),
    developer: { displayName: r.owner_name, handle: r.owner_handle },
  }));
}
