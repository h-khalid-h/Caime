/**
 * Download your data (docs/SECURITY.md, the privacy page): everything Caishy keeps about someone,
 * and by them, as one file. What they sent and set, what Caishy worked out for them, and what it
 * recorded of their use, for as long as it keeps each (lib/retention.ts).
 *
 * The file shows only what the app would show them. So three things stay out: other people's
 * words (their messages, a checklist item they added, a note on a request they sent, their notes
 * on an action or a decision, a notification's title or preview, a suggestion's quote), what's
 * kept from them in the app (who on a team did what, a request declined, a call turned down, what
 * a group they left is called now, an app of an organization they've left), and secrets, which
 * Caishy keeps only as hashes or never shows (a password, tokens, recovery codes, a calendar's
 * address, a device's address for notifications).
 */
import { callResult } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { automationView, visibleSaved } from './automations';
import { type CustomerMask, maskPayload, masksFor } from './business';
import { relationshipView } from './relations';
import { meView } from './users';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const fileUrl = (id: string) => `/v1/files/${id}`;
type Payload = Record<string, unknown>;

/** Only what they put on a checklist: others' items, and who ticked what, are theirs. */
function ownItems(payload: Payload, me: string): Payload {
  const fields = payload.fields as Payload | undefined;
  if (payload.kit !== 'checklist' || !fields || !Array.isArray(fields.items)) return payload;
  const items = (fields.items as Array<Payload>)
    .filter((i) => i.addedBy === null || i.addedBy === me)
    .map((i) => ({ ...i, doneBy: i.doneBy === me ? me : null }));
  return { ...payload, fields: { ...fields, items } };
}

/** A message they sent, as the app shows it to them. */
function asTheySee(
  m: { kind: string; payload: Payload; conversation_id: string },
  me: string,
  masks: Map<string, CustomerMask>,
): Payload {
  let payload = m.payload;
  // A call they made says what the app does: never that they were turned down.
  if (m.kind === 'system' && payload.event === 'call' && typeof payload.outcome === 'string')
    payload = {
      ...payload,
      outcome: callResult({ outcome: payload.outcome as never, outgoing: true }),
    };
  if (m.kind === 'kit') payload = ownItems(payload, me);
  const mask = masks.get(m.conversation_id);
  return mask ? maskPayload(payload, mask) : payload;
}

export async function buildExport(ctx: AppContext, me: string, now: Date) {
  const db = ctx.db;
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', me)
    .executeTakeFirstOrThrow();
  const [
    invitedByOrg,
    identities,
    recoveryCodes,
    relationships,
    events,
    policies,
    customRoles,
    connections,
    requests,
    blockedPeople,
    blockedOrgs,
    conversations,
    messages,
    theirChecklists,
    reactions,
    votes,
    hidden,
    shared,
    albumPhotos,
    tasks,
    suggestions,
    decisions,
    contexts,
    notifications,
    files,
    sessions,
    pushes,
    privateDevices,
    calls,
    groupCalls,
    reports,
    security,
    activity,
    aiRuns,
    spaces,
    orgs,
    following,
    updates,
    orgApps,
    orgAgents,
    threads,
    copies,
    tokens,
    apps,
    connectedApps,
    calendarFeed,
    automations,
    saved,
    visible,
    customers,
  ] = await Promise.all([
    // An organization's page is public; whose link a person followed is only counted (R29: it
    // could name someone under 18, or someone who can't be found).
    user.invited_by_org
      ? db
          .selectFrom('organizations')
          .select(['name', 'handle'])
          .where('id', '=', user.invited_by_org)
          .executeTakeFirst()
      : undefined,
    db.selectFrom('identities').selectAll().where('user_id', '=', me).execute(),
    db
      .selectFrom('recovery_codes')
      .select([
        sql<number>`count(*) filter (where used_at is null)::int`.as('left'),
        sql<Date | null>`max(created_at)`.as('made_at'),
      ])
      .where('user_id', '=', me)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('relationships as r')
      .innerJoin('users as u', 'u.id', 'r.subject_id')
      .selectAll('r')
      .select(['u.display_name as subject_name', 'u.handle as subject_handle'])
      .where('r.owner_id', '=', me)
      .execute(),
    db
      .selectFrom('relationship_events')
      .selectAll()
      .where('owner_id', '=', me)
      .orderBy('at')
      .execute(),
    // A rule for one person or one organization names them.
    db
      .selectFrom('relationship_policies as p')
      .leftJoin('connection_sides as s', (j) =>
        j.onRef('s.connection_id', '=', 'p.scope_connection_id').on('s.owner_id', '=', me),
      )
      .leftJoin('users as u', 'u.id', 's.other_id')
      .leftJoin('organizations as o', 'o.id', 'p.scope_org_id')
      .select([
        'p.name',
        'p.scope_sphere',
        'p.scope_role',
        'p.scope_connection_id',
        'p.scope_org_id',
        'p.settings',
        'u.display_name as person_name',
        'u.handle as person_handle',
        'o.name as org_name',
        'o.handle as org_handle',
      ])
      .where('p.user_id', '=', me)
      .orderBy('p.created_at')
      .execute(),
    db
      .selectFrom('custom_roles')
      .select(['sphere', 'label', 'created_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .innerJoin('users as u', 'u.id', 's.other_id')
      .leftJoin('users as m', 'm.id', 's.merged_into')
      .leftJoin('identities as i', 'i.id', 's.identity_id')
      .select([
        'u.display_name',
        'u.handle',
        's.nickname',
        's.note',
        's.attention',
        's.muted_until',
        's.archived_at',
        'm.display_name as merged_name',
        'm.handle as merged_handle',
        'i.kind as identity_kind',
        'i.display_name as identity_name',
        'c.status',
        'c.created_at',
        'c.removed_at',
      ])
      .where('s.owner_id', '=', me)
      .orderBy('c.created_at')
      .execute(),
    db
      .selectFrom('connection_requests as r')
      .innerJoin('users as f', 'f.id', 'r.from_user')
      .innerJoin('users as t', 't.id', 'r.to_user')
      .select([
        'r.from_user',
        'f.display_name as from_name',
        'f.handle as from_handle',
        't.display_name as to_name',
        't.handle as to_handle',
        'r.note',
        'r.context_sphere',
        'r.context_org_name',
        'r.pending_relationship',
        'r.status',
        'r.created_at',
        'r.responded_at',
      ])
      .where((eb) => eb.or([eb('r.from_user', '=', me), eb('r.to_user', '=', me)]))
      .orderBy('r.created_at')
      .execute(),
    db
      .selectFrom('blocks as b')
      .innerJoin('users as u', 'u.id', 'b.blocked_id')
      .select(['u.display_name', 'u.handle', 'b.created_at'])
      .where('b.blocker_id', '=', me)
      .orderBy('b.created_at')
      .execute(),
    db
      .selectFrom('org_blocks as b')
      .innerJoin('organizations as o', 'o.id', 'b.org_id')
      .select(['o.name', 'o.handle', 'b.created_at'])
      .where('b.user_id', '=', me)
      .orderBy('b.created_at')
      .execute(),
    db
      .selectFrom('participants as p')
      .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
      .select([
        'c.id',
        'c.kind',
        'c.title',
        'c.privacy_class',
        'c.retention_days',
        'c.created_at',
        'p.role',
        'p.joined_at',
        'p.left_at',
        'p.last_read_seq',
        'p.last_delivered_seq',
        'p.dismissed_seq',
        'p.attention',
        'p.muted_until',
        'p.archived_at',
        'p.pinned_at',
        'p.request_state',
        'p.draft',
        'p.draft_updated_at',
      ])
      .where('p.user_id', '=', me)
      .orderBy('p.joined_at')
      .execute(),
    db
      .selectFrom('messages')
      .select([
        'id',
        'conversation_id',
        'kind',
        'body',
        'payload',
        'entities',
        'mode',
        'mode_source',
        'is_question',
        'is_request',
        'mentions',
        'sealed',
        'reply_to_id',
        'forwarded_from_id',
        'urgent',
        'sent_via',
        'created_at',
        'edited_at',
        'deleted_at',
        'expires_at',
      ])
      .where('sender_id', '=', me)
      .orderBy('created_at')
      .execute(),
    // What they put on other people's checklists, in the conversations they're in or were in.
    db
      .selectFrom('messages as m')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', me),
      )
      .select(['m.id', 'm.conversation_id', 'm.payload'])
      .where('m.kind', '=', 'kit')
      .where('m.sender_id', '<>', me)
      .where('m.deleted_at', 'is', null)
      .where(
        sql<boolean>`m.payload->'fields'->'items' @> ${JSON.stringify([{ addedBy: me }])}::jsonb`,
      )
      .orderBy('m.created_at')
      .execute(),
    db
      .selectFrom('reactions')
      .select(['message_id', 'emoji', 'created_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('poll_votes')
      .select(['message_id', 'option_id', 'created_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('hidden_messages')
      .select(['message_id', 'created_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('assets')
      .select(['kind', 'conversation_id', 'message_id', 'file_id', 'url', 'title', 'created_at'])
      .where('sender_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('album_photos')
      .select(['message_id', 'file_id', 'created_at'])
      .where('added_by', '=', me)
      .orderBy('created_at')
      .execute(),
    // Theirs, and what someone else asked of them. An item someone keeps of what they're waiting
    // on is that person's own, unseen by the one it's about.
    db
      .selectFrom('tasks as t')
      .innerJoin('users as o', 'o.id', 't.owner_id')
      .leftJoin('users as a', 'a.id', 't.assignee_id')
      .select([
        't.owner_id',
        't.assignee_id',
        'o.display_name as owner_name',
        'o.handle as owner_handle',
        'a.display_name as assignee_name',
        'a.handle as assignee_handle',
        't.title',
        't.notes',
        't.status',
        't.source',
        't.shared',
        't.relationship_snapshot',
        't.due_at',
        't.remind_at',
        't.conversation_id',
        't.message_id',
        't.created_at',
        't.completed_at',
      ])
      .where((eb) =>
        eb.or([
          eb('t.owner_id', '=', me),
          eb.and([eb('t.assignee_id', '=', me), eb('t.shared', '=', true)]),
        ]),
      )
      .orderBy('t.created_at')
      .execute(),
    db
      .selectFrom('suggestions as s')
      .leftJoin('users as u', 'u.id', 's.subject_user_id')
      .select([
        's.kind',
        's.title',
        's.rationale',
        's.confidence',
        's.status',
        's.due_at',
        's.due_text',
        's.conversation_id',
        's.message_id',
        'u.display_name as subject_name',
        'u.handle as subject_handle',
        's.created_at',
        's.resolved_at',
      ])
      .where('s.user_id', '=', me)
      .orderBy('s.created_at')
      .execute(),
    db
      .selectFrom('decisions')
      .select([
        'title',
        'status',
        'decided_by',
        'recorded_by',
        'conversation_id',
        'message_id',
        'decided_at',
      ])
      .where((eb) => eb.or([eb('decided_by', '=', me), eb('recorded_by', '=', me)]))
      .orderBy('decided_at')
      .execute(),
    // Those they made that they can still see (lib/contexts.ts contextVisible): theirs alone, or
    // linked to a conversation they're in. One in a group they've left went with the group.
    db
      .selectFrom('contexts as x')
      .select([
        'x.title',
        'x.purpose',
        'x.status',
        'x.deadline_at',
        'x.external_ref',
        'x.created_at',
      ])
      .where('x.created_by', '=', me)
      .where((eb) =>
        eb.or([
          eb.not(
            eb.exists(
              eb
                .selectFrom('conversations as c')
                .select('c.id')
                .whereRef('c.context_id', '=', 'x.id'),
            ),
          ),
          eb.exists(
            eb
              .selectFrom('conversations as c')
              .innerJoin('participants as p', (j) =>
                j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', me),
              )
              .select('c.id')
              .whereRef('c.context_id', '=', 'x.id')
              .where('p.left_at', 'is', null),
          ),
        ]),
      )
      .orderBy('x.created_at')
      .execute(),
    db
      .selectFrom('notifications')
      .select([
        'kind',
        'level',
        'count',
        'delivery',
        'reason',
        'pushed_at',
        'read_at',
        'dismissed_at',
        'created_at',
      ])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('files')
      .select([
        'id',
        'name',
        'mime',
        'size',
        'kind',
        'status',
        'width',
        'height',
        'duration_ms',
        'created_at',
      ])
      .where('owner_id', '=', me)
      .orderBy('created_at')
      .execute(),
    // Every sign-in still kept: one ended goes 30 days after it did (lib/retention.ts).
    db
      .selectFrom('sessions')
      .select([
        'id',
        'kind',
        'device_name',
        'platform',
        'ip',
        'user_agent',
        'created_at',
        'last_seen_at',
        'expires_at',
        'revoked_at',
      ])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('push_subscriptions')
      .select(['session_id', 'kind', 'endpoint', 'created_at', 'last_success_at', 'failures'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('e2ee_devices')
      .select(['name', 'encryption_key', 'signing_key', 'created_at', 'approved_at', 'revoked_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('calls as c')
      .leftJoin('users as er', 'er.id', 'c.caller_id')
      .leftJoin('users as ee', 'ee.id', 'c.callee_id')
      .select([
        'c.conversation_id',
        'c.kind',
        'c.caller_id',
        'er.display_name as caller_name',
        'er.handle as caller_handle',
        'ee.display_name as callee_name',
        'ee.handle as callee_handle',
        'c.state',
        'c.outcome',
        'c.created_at',
        'c.answered_at',
        'c.ended_at',
      ])
      .where('c.is_group', '=', false)
      .where((eb) => eb.or([eb('c.caller_id', '=', me), eb('c.callee_id', '=', me)]))
      .orderBy('c.created_at')
      .execute(),
    db
      .selectFrom('call_members as m')
      .innerJoin('calls as c', 'c.id', 'm.call_id')
      .select([
        'c.conversation_id',
        'c.kind',
        'c.caller_id',
        'm.state',
        'm.rung_at',
        'm.joined_at',
        'm.left_at',
        'c.ended_at',
      ])
      .where('m.user_id', '=', me)
      .orderBy('m.rung_at')
      .execute(),
    // Reports they made. Those about them stay with the people who run Caishy: they'd name who made them.
    db
      .selectFrom('reports as r')
      .leftJoin('users as u', 'u.id', 'r.target_user_id')
      .leftJoin('organizations as o', 'o.id', 'r.org_id')
      .select([
        'u.display_name as person_name',
        'u.handle as person_handle',
        'o.name as org_name',
        'r.message_id',
        'r.conversation_id',
        'r.update_id',
        'r.reason',
        'r.details',
        'r.status',
        'r.created_at',
      ])
      .where('r.reporter_id', '=', me)
      .orderBy('r.created_at')
      .execute(),
    // What they did, and what was done to their account by others (their plan changed): the
    // network address and browser of someone else's are that person's.
    db
      .selectFrom('audit_log')
      .select(['actor_id', 'action', 'target', 'ip', 'user_agent', 'metadata', 'created_at'])
      .where((eb) =>
        eb.or([
          eb('actor_id', '=', me),
          eb.and([eb('target', '=', me), eb('action', '=', 'plan.changed')]),
        ]),
      )
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('domain_events')
      .select(['type', 'payload', 'created_at'])
      .where('actor_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('ai_runs')
      .select([
        'feature',
        'provider',
        'model',
        'outcome',
        'input_tokens',
        'output_tokens',
        'latency_ms',
        'created_at',
      ])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('space_members as m')
      .innerJoin('spaces as s', 's.id', 'm.space_id')
      .select(['s.name', 's.kind', 's.created_by', 'm.role', 'm.joined_at', 'm.left_at'])
      .where('m.user_id', '=', me)
      .orderBy('m.joined_at')
      .execute(),
    db
      .selectFrom('org_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.org_id')
      .select([
        'o.name',
        'o.handle',
        'o.created_by',
        'm.role',
        'm.title',
        'm.joined_at',
        'm.left_at',
      ])
      .where('m.user_id', '=', me)
      .orderBy('m.joined_at')
      .execute(),
    db
      .selectFrom('org_follows as f')
      .innerJoin('organizations as o', 'o.id', 'f.org_id')
      .select(['o.name', 'o.handle', 'f.notify', 'f.read_at', 'f.created_at'])
      .where('f.user_id', '=', me)
      .orderBy('f.created_at')
      .execute(),
    db
      .selectFrom('org_updates as u')
      .innerJoin('organizations as o', 'o.id', 'u.org_id')
      .select(['o.name', 'o.handle', 'u.body', 'u.created_at', 'u.edited_at', 'u.deleted_at'])
      .where('u.posted_by', '=', me)
      .orderBy('u.created_at')
      .execute(),
    // An app they made is the organization's: how it's set up is theirs to see only while they
    // still run it with the team.
    db
      .selectFrom('org_apps as a')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .leftJoin('org_members as m', (j) =>
        j
          .onRef('m.org_id', '=', 'a.org_id')
          .on('m.user_id', '=', me)
          .on('m.left_at', 'is', null)
          .on('m.role', 'in', ['owner', 'admin']),
      )
      .select([
        'o.name as org_name',
        'a.name',
        'a.scopes',
        'a.events',
        'a.webhook_url',
        'a.created_at',
        'a.revoked_at',
        'm.role as running',
      ])
      .where('a.created_by', '=', me)
      .orderBy('a.created_at')
      .execute(),
    db
      .selectFrom('org_agents as a')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .innerJoin('users as b', 'b.id', 'a.bot_user_id')
      .leftJoin('org_members as m', (j) =>
        j
          .onRef('m.org_id', '=', 'a.org_id')
          .on('m.user_id', '=', me)
          .on('m.left_at', 'is', null)
          .on('m.role', 'in', ['owner', 'admin']),
      )
      .select([
        'o.name as org_name',
        'b.display_name',
        'a.paused_at',
        'a.created_at',
        'm.role as running',
      ])
      .where('a.created_by', '=', me)
      .orderBy('a.created_at')
      .execute(),
    // Business conversations: as the customer, and as one on its team who held, escalated or
    // resolved it. A customer sees the organization, not the team's workings (R15).
    db
      .selectFrom('business_threads as t')
      .innerJoin('organizations as o', 'o.id', 't.org_id')
      .select([
        'o.name',
        'o.handle',
        't.conversation_id',
        't.customer_id',
        't.assignee_id',
        't.escalated_by',
        't.escalated_at',
        't.escalation_note',
        't.resolved_by',
        't.resolved_at',
        't.created_at',
      ])
      .where((eb) =>
        eb.or([
          eb('t.customer_id', '=', me),
          eb('t.assignee_id', '=', me),
          eb('t.escalated_by', '=', me),
          eb('t.resolved_by', '=', me),
        ]),
      )
      .orderBy('t.created_at')
      .execute(),
    // The copies made for an organization's apps of what they sent it (30 days, lib/retention.ts),
    // found by the customer they name (0034's index).
    db
      .selectFrom('webhook_deliveries as d')
      .innerJoin('org_apps as a', 'a.id', 'd.app_id')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .select([
        'o.name as org_name',
        'a.name as app_name',
        'd.event',
        'd.payload',
        'd.status',
        'd.created_at',
      ])
      .where(sql<boolean>`d.payload->'data'->'customer'->>'id' = ${me}`)
      .orderBy('d.created_at')
      .execute(),
    db
      .selectFrom('personal_tokens')
      .select(['name', 'scopes', 'created_at', 'last_used_at', 'expires_at', 'revoked_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('oauth_clients')
      .select([
        'client_id',
        'name',
        'website',
        'redirect_uris',
        'secret_hash',
        'created_at',
        'revoked_at',
      ])
      .where('owner_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('oauth_grants as g')
      .innerJoin('oauth_clients as c', 'c.id', 'g.client_id')
      .select([
        'c.name',
        'c.website',
        'g.scopes',
        'g.created_at',
        'g.last_used_at',
        'g.revoked_at',
        'c.revoked_at as app_removed_at',
      ])
      .where('g.user_id', '=', me)
      .orderBy('g.created_at')
      .execute(),
    db
      .selectFrom('calendar_feeds')
      .select(['created_at', 'last_read_at'])
      .where('user_id', '=', me)
      .executeTakeFirst(),
    db
      .selectFrom('automations')
      .selectAll()
      .where('user_id', '=', me)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('saved_items')
      .select(['id', 'collection', 'conversation_id', 'message_id', 'created_at'])
      .where('user_id', '=', me)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    // What's kept of a saved thing (its link, its file) only while they can still see it: never
    // from a conversation they've left, or a message deleted or hidden since.
    visibleSaved(db, me)
      .leftJoin('assets as a', 'a.id', 's.asset_id')
      .select(['s.id', 'a.kind as asset_kind', 'a.file_id', 'a.url'])
      .execute(),
    db
      .selectFrom('billing_customers as c')
      .leftJoin('billing_subscriptions as s', 's.customer_id', 'c.id')
      .select([
        'c.id',
        'c.livemode',
        'c.created_at',
        'c.closed_at',
        's.plan',
        's.interval',
        's.status',
        's.amount',
        's.currency',
        's.current_period_end',
        's.cancel_at_period_end',
      ])
      .where('c.user_id', '=', me)
      .orderBy('c.created_at')
      .execute(),
  ]);
  const person = (name: string | null, handle: string | null) =>
    name === null ? null : { displayName: name, handle };
  const masks = await masksFor(ctx, me, [...new Set(messages.map((m) => m.conversation_id))]);
  const pushesOf = new Map<string, typeof pushes>();
  for (const p of pushes)
    if (p.session_id) pushesOf.set(p.session_id, [...(pushesOf.get(p.session_id) ?? []), p]);
  const kept = new Map(visible.map((v) => [v.id, v]));
  const billing = new Map<
    string,
    { customer: (typeof customers)[number]; plans: typeof customers }
  >();
  for (const b of customers) {
    const at = billing.get(b.id) ?? { customer: b, plans: [] };
    if (b.plan) at.plans.push(b);
    billing.set(b.id, at);
  }
  const host = (endpoint: string) => {
    try {
      return new URL(endpoint).host;
    } catch {
      return null;
    }
  };
  return {
    format: 'caishy-export/2',
    exportedAt: now.toISOString(),
    note: 'Everything Caishy keeps about you and by you: what you sent and set, what it worked out for you, and what it recorded of your use, for as long as it keeps each, as the app shows it to you. Other people’s words aren’t in it (their messages, their items and notes, quotes of them), nor reports others made about you, nor secrets, which Caishy keeps only as hashes or never shows. Files are listed; each downloads from its link while you are signed in.',
    account: {
      ...meView(user, now),
      lastActiveAt: iso(user.last_active_at),
      // Only counted, and never shown to anyone else; a person's link doesn't say whose.
      joinedThrough: invitedByOrg
        ? { organization: { name: invitedByOrg.name, handle: invitedByOrg.handle } }
        : user.invited_by
          ? { person: true }
          : null,
    },
    identities: identities.map((i) => ({
      kind: i.kind,
      displayName: i.display_name,
      headline: i.headline,
      orgName: i.org_name,
      isDefault: i.is_default,
    })),
    recoveryCodes: { left: recoveryCodes.left, madeAt: iso(recoveryCodes.made_at) },
    relationships: relationships.map((r) => ({
      person: { displayName: r.subject_name, handle: r.subject_handle },
      ...relationshipView(r),
    })),
    relationshipHistory: events.map((e) => ({
      kind: e.kind,
      before: e.before,
      after: e.after,
      at: e.at.toISOString(),
    })),
    yourRoles: customRoles.map((r) => ({
      sphere: r.sphere,
      label: r.label,
      createdAt: r.created_at.toISOString(),
    })),
    notificationRules: policies.map((p) => ({
      name: p.name,
      scope: {
        sphere: p.scope_sphere,
        role: p.scope_role,
        person: p.scope_connection_id ? person(p.person_name, p.person_handle) : null,
        organization:
          p.scope_org_id && p.org_name ? { name: p.org_name, handle: p.org_handle } : null,
      },
      settings: p.settings,
    })),
    connections: connections.map((c) => ({
      displayName: c.display_name,
      handle: c.handle,
      nickname: c.nickname,
      note: c.note,
      attention: c.attention,
      mutedUntil: iso(c.muted_until),
      archivedAt: iso(c.archived_at),
      // Another account of someone else's, as they put it together.
      mergedInto: person(c.merged_name, c.merged_handle),
      // The identity they show this person.
      shownAs: c.identity_kind ? { kind: c.identity_kind, displayName: c.identity_name } : null,
      status: c.status,
      connectedAt: c.created_at.toISOString(),
      removedAt: iso(c.removed_at),
    })),
    connectionRequests: requests.map((r) => {
      const sent = r.from_user === me;
      // A sender only ever learns a request was accepted, never that it was declined or why it
      // ended (a block ends it silently), nor when.
      const status = sent
        ? r.status === 'accepted' || r.status === 'pending'
          ? r.status
          : 'ended'
        : r.status;
      return {
        direction: sent ? 'sent' : 'received',
        person: sent
          ? { displayName: r.to_name, handle: r.to_handle }
          : { displayName: r.from_name, handle: r.from_handle },
        // A note someone sent with theirs is their words, as a message would be.
        note: sent ? r.note : null,
        sharedContext: { sphere: r.context_sphere, orgName: r.context_org_name },
        // How you described them, kept for when they accept: yours only.
        yourDescription: sent ? r.pending_relationship : null,
        status,
        at: r.created_at.toISOString(),
        answeredAt: !sent || r.status === 'accepted' ? iso(r.responded_at) : null,
      };
    }),
    blocked: {
      people: blockedPeople.map((b) => ({
        displayName: b.display_name,
        handle: b.handle,
        since: b.created_at.toISOString(),
      })),
      organizations: blockedOrgs.map((b) => ({
        name: b.name,
        handle: b.handle,
        since: b.created_at.toISOString(),
      })),
    },
    // One they've left says only what was theirs: what it's called now, and how it's set, is for
    // the people still in it.
    conversations: conversations.map((c) => {
      const left = c.left_at !== null;
      return {
        id: c.id,
        kind: c.kind,
        ...(left
          ? {}
          : {
              title: c.title,
              private: c.privacy_class === 'private',
              disappearingAfterDays: c.retention_days,
              createdAt: c.created_at.toISOString(),
            }),
        role: c.role,
        joinedAt: iso(c.joined_at),
        leftAt: iso(c.left_at),
        yourSettings: {
          attention: c.attention,
          mutedUntil: iso(c.muted_until),
          archivedAt: iso(c.archived_at),
          pinnedAt: iso(c.pinned_at),
          request: c.request_state,
        },
        // How far they'd read and been delivered, and what they said didn't need them.
        readUpTo: Number(c.last_read_seq),
        deliveredUpTo: Number(c.last_delivered_seq),
        doesntNeedYouUpTo: Number(c.dismissed_seq),
        draft: c.draft ? { text: c.draft, savedAt: iso(c.draft_updated_at) } : null,
      };
    }),
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      kind: m.kind,
      body: m.deleted_at ? null : m.body,
      payload: m.deleted_at ? null : asTheySee(m, me, masks),
      // What Caishy noted in it (dates, amounts, links and how safe they look, topics), and
      // whether it took it for a question or a request.
      noted: m.deleted_at ? null : m.entities,
      question: m.is_question,
      request: m.is_request,
      mode: { value: m.mode, source: m.mode_source },
      // Its words were sealed on your device; the server has only what it can't open.
      sealed: m.sealed !== null,
      replyTo: m.reply_to_id,
      forwardedFrom: m.forwarded_from_id,
      urgent: m.urgent,
      sentVia: m.sent_via,
      sentAt: m.created_at.toISOString(),
      editedAt: iso(m.edited_at),
      deletedAt: iso(m.deleted_at),
      disappearsAt: iso(m.expires_at),
    })),
    yourItemsOnOthersChecklists: theirChecklists.flatMap((m) => {
      const items = ((m.payload.fields as Payload | undefined)?.items ?? []) as Array<Payload>;
      return items
        .filter((i) => i.addedBy === me)
        .map((i) => ({
          checklistMessageId: m.id,
          conversationId: m.conversation_id,
          text: i.text,
          done: Boolean(i.done),
          doneByYou: i.doneBy === me,
        }));
    }),
    reactions: reactions.map((r) => ({
      messageId: r.message_id,
      emoji: r.emoji,
      at: r.created_at.toISOString(),
    })),
    pollVotes: votes.map((v) => ({
      messageId: v.message_id,
      option: v.option_id,
      at: v.created_at.toISOString(),
    })),
    hiddenMessages: hidden.map((h) => ({
      messageId: h.message_id,
      at: h.created_at.toISOString(),
    })),
    sharedInConversations: shared.map((a) => ({
      kind: a.kind,
      conversationId: a.conversation_id,
      messageId: a.message_id,
      file: a.file_id ? fileUrl(a.file_id) : null,
      link: a.file_id ? null : a.url,
      title: a.title,
      at: a.created_at.toISOString(),
    })),
    albumPhotos: albumPhotos.map((p) => ({
      albumMessageId: p.message_id,
      file: fileUrl(p.file_id),
      addedAt: p.created_at.toISOString(),
    })),
    actions: tasks.map((t) => {
      const yours = t.owner_id === me;
      return {
        title: t.title,
        // Someone else's notes on theirs stay theirs.
        notes: yours ? t.notes : null,
        status: t.status,
        source: t.source,
        yours,
        // Someone else's, that they asked of you.
        from: yours ? null : { displayName: t.owner_name, handle: t.owner_handle },
        // Yours, waiting on someone: who, and how you knew them then (one of someone else's is
        // only ever in it because it waits on you).
        waitingOn:
          t.assignee_id && t.assignee_id !== me
            ? {
                person: person(t.assignee_name, t.assignee_handle),
                asYouKnewThem: t.relationship_snapshot,
              }
            : null,
        assignedToYou: t.assignee_id === me,
        shared: t.shared,
        dueAt: iso(t.due_at),
        remindAt: iso(t.remind_at),
        conversationId: t.conversation_id,
        messageId: t.message_id,
        createdAt: t.created_at.toISOString(),
        completedAt: iso(t.completed_at),
      };
    }),
    // Why Caishy suggested each, when that came from something other than a message: a reason
    // built from messages quotes them, and can come to quote someone else's reply.
    suggestions: suggestions.map((s) => ({
      kind: s.kind,
      title: s.title,
      reason: s.message_id === null ? s.rationale : null,
      about: person(s.subject_name, s.subject_handle),
      confidence: s.confidence,
      status: s.status,
      due: s.due_text ?? iso(s.due_at),
      conversationId: s.conversation_id,
      messageId: s.message_id,
      createdAt: s.created_at.toISOString(),
      answeredAt: iso(s.resolved_at),
    })),
    // Those decided by or recorded by them. Their notes can be rewritten by others, so they
    // aren't in it.
    decisions: decisions.map((d) => ({
      title: d.title,
      status: d.status,
      decidedByYou: d.decided_by === me,
      recordedByYou: d.recorded_by === me,
      conversationId: d.conversation_id,
      messageId: d.message_id,
      decidedAt: d.decided_at.toISOString(),
    })),
    contexts: contexts.map((c) => ({
      title: c.title,
      purpose: c.purpose,
      status: c.status,
      deadlineAt: iso(c.deadline_at),
      reference: c.external_ref,
      createdAt: c.created_at.toISOString(),
    })),
    // When each came and how it went; its title and preview are someone else's words.
    notifications: notifications.map((n) => ({
      kind: n.kind,
      level: n.level,
      count: n.count,
      delivery: n.delivery,
      reason: n.reason,
      pushedAt: iso(n.pushed_at),
      readAt: iso(n.read_at),
      dismissedAt: iso(n.dismissed_at),
      createdAt: n.created_at.toISOString(),
    })),
    files: files.map((f) => ({
      name: f.name,
      mime: f.mime,
      size: Number(f.size),
      kind: f.kind,
      status: f.status,
      width: f.width,
      height: f.height,
      durationMs: f.duration_ms,
      uploadedAt: f.created_at.toISOString(),
      url: f.status === 'ready' ? fileUrl(f.id) : null,
    })),
    devices: sessions.map((s) => ({
      kind: s.kind,
      deviceName: s.device_name,
      platform: s.platform,
      networkAddress: s.ip,
      browser: s.user_agent,
      signedInAt: s.created_at.toISOString(),
      lastSeenAt: s.last_seen_at.toISOString(),
      expiresAt: s.expires_at.toISOString(),
      signedOutAt: iso(s.revoked_at),
      // Which service holds its address for notifications; the address itself is a secret.
      notifications: (pushesOf.get(s.id) ?? []).map((p) => ({
        kind: p.kind,
        service: host(p.endpoint),
        since: p.created_at.toISOString(),
        lastDeliveredAt: iso(p.last_success_at),
        failures: p.failures,
      })),
    })),
    privateConversationDevices: privateDevices.map((d) => ({
      name: d.name,
      publicKeys: { encryption: d.encryption_key, signing: d.signing_key },
      addedAt: d.created_at.toISOString(),
      approvedAt: iso(d.approved_at),
      removedAt: iso(d.revoked_at),
    })),
    // As their call history says it (core callResult): whoever calls is never told no.
    calls: calls.map((c) => {
      const outgoing = c.caller_id === me;
      return {
        kind: c.kind,
        direction: outgoing ? 'outgoing' : 'incoming',
        with: outgoing
          ? person(c.callee_name, c.callee_handle)
          : person(c.caller_name, c.caller_handle),
        conversationId: c.conversation_id,
        outcome: c.outcome ? callResult({ outcome: c.outcome, outgoing }) : c.state,
        at: c.created_at.toISOString(),
        answeredAt: iso(c.answered_at),
        endedAt: iso(c.ended_at),
      };
    }),
    groupCalls: groupCalls.map((c) => ({
      kind: c.kind,
      conversationId: c.conversation_id,
      startedByYou: c.caller_id === me,
      you: c.state,
      rungAt: c.rung_at.toISOString(),
      joinedAt: iso(c.joined_at),
      leftAt: iso(c.left_at),
      endedAt: iso(c.ended_at),
    })),
    reports: reports.map((r) => ({
      about: r.person_name
        ? { person: { displayName: r.person_name, handle: r.person_handle } }
        : r.org_name
          ? { organization: r.org_name }
          : null,
      messageId: r.message_id,
      conversationId: r.conversation_id,
      updateId: r.update_id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      at: r.created_at.toISOString(),
    })),
    securityRecords: security.map((a) => {
      const theirs = a.actor_id === me;
      return {
        action: a.action,
        byYou: theirs,
        target: a.target,
        networkAddress: theirs ? a.ip : null,
        browser: theirs ? a.user_agent : null,
        details: a.metadata,
        at: a.created_at.toISOString(),
      };
    }),
    activityLog: activity.map((e) => ({
      type: e.type,
      details: e.payload,
      at: e.created_at.toISOString(),
    })),
    // When AI assist was used and for what; what it read and wrote is never stored.
    aiAssist: aiRuns.map((r) => ({
      feature: r.feature,
      provider: r.provider,
      model: r.model,
      outcome: r.outcome,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      latencyMs: r.latency_ms,
      at: r.created_at.toISOString(),
    })),
    // A space they've left keeps only their part: its name now is for those still in it.
    spaces: spaces.map((sp) => ({
      ...(sp.left_at ? {} : { name: sp.name }),
      kind: sp.kind,
      madeByYou: sp.created_by === me,
      role: sp.role,
      joinedAt: sp.joined_at.toISOString(),
      leftAt: iso(sp.left_at),
    })),
    organizations: orgs.map((o) => ({
      name: o.name,
      handle: o.handle,
      madeByYou: o.created_by === me,
      role: o.role,
      title: o.title,
      joinedAt: o.joined_at.toISOString(),
      leftAt: iso(o.left_at),
    })),
    following: following.map((f) => ({
      organization: { name: f.name, handle: f.handle },
      notify: f.notify,
      since: f.created_at.toISOString(),
      lastReadAt: iso(f.read_at),
    })),
    // What they posted as it was: once edited, by them or another admin, it may not be theirs.
    updatesYouPosted: updates.map((u) => ({
      organization: { name: u.name, handle: u.handle },
      body: u.deleted_at || u.edited_at ? null : u.body,
      postedAt: u.created_at.toISOString(),
      editedAt: iso(u.edited_at),
      deletedAt: iso(u.deleted_at),
    })),
    organizationAppsYouMade: orgApps.map((a) =>
      a.running
        ? {
            organization: a.org_name,
            name: a.name,
            scopes: a.scopes,
            events: a.events,
            webhookUrl: a.webhook_url,
            createdAt: a.created_at.toISOString(),
            removedAt: iso(a.revoked_at),
          }
        : { organization: a.org_name, createdAt: a.created_at.toISOString() },
    ),
    organizationAgentsYouMade: orgAgents.map((a) =>
      a.running
        ? {
            organization: a.org_name,
            name: a.display_name,
            pausedAt: iso(a.paused_at),
            createdAt: a.created_at.toISOString(),
          }
        : { organization: a.org_name, createdAt: a.created_at.toISOString() },
    ),
    businessConversations: threads.map((t) =>
      t.customer_id === me
        ? {
            organization: { name: t.name, handle: t.handle },
            conversationId: t.conversation_id,
            as: 'customer',
            startedAt: t.created_at.toISOString(),
          }
        : {
            organization: { name: t.name, handle: t.handle },
            conversationId: t.conversation_id,
            as: 'team',
            handedToYou: t.assignee_id === me,
            escalatedByYou: t.escalated_by === me,
            escalatedAt: iso(t.escalated_at),
            escalationNote: t.escalated_by === me ? t.escalation_note : null,
            resolvedByYou: t.resolved_by === me,
            resolvedAt: iso(t.resolved_at),
            startedAt: t.created_at.toISOString(),
          },
    ),
    // What an organization's apps were sent about them, while it's kept (lib/business.ts,
    // lib/kits.ts): their own message, or what happened to one of its cards in their conversation;
    // never the card's words, which are the organization's.
    copiesForOrganizationsApps: copies.map((d) => {
      const data = ((d.payload as Payload).data ?? {}) as Payload;
      const message = (data.message ?? {}) as Payload;
      const kit = data.kit as Payload | undefined;
      return {
        organization: d.org_name,
        app: d.app_name,
        event: d.event,
        status: d.status,
        at: d.created_at.toISOString(),
        message: kit
          ? null
          : { id: message.id ?? null, kind: message.kind ?? null, body: message.body ?? null },
        card: kit
          ? {
              messageId: message.id ?? null,
              kit: kit.name ?? kit.key ?? null,
              state: data.state ?? null,
              moved: data.to === undefined ? null : { from: data.from ?? null, to: data.to },
              byYou: data.by === 'customer',
            }
          : null,
      };
    }),
    // What can act as you, and what you made for others: names and permissions, never secrets.
    accessTokens: tokens.map((k) => ({
      name: k.name,
      scopes: k.scopes,
      createdAt: k.created_at.toISOString(),
      lastUsedAt: iso(k.last_used_at),
      expiresAt: iso(k.expires_at),
      revokedAt: iso(k.revoked_at),
    })),
    appsYouMade: apps.map((a) => ({
      clientId: a.client_id,
      name: a.name,
      website: a.website,
      redirectUris: a.redirect_uris,
      confidential: a.secret_hash !== null,
      createdAt: a.created_at.toISOString(),
      removedAt: iso(a.revoked_at),
    })),
    connectedApps: connectedApps.map((g) => ({
      name: g.name,
      website: g.website,
      scopes: g.scopes,
      allowedAt: g.created_at.toISOString(),
      lastUsedAt: iso(g.last_used_at),
      removedAt: iso(g.revoked_at ?? g.app_removed_at),
    })),
    // Whether a calendar reads your actions (PRD §72), never its address.
    calendarFeed: calendarFeed
      ? {
          createdAt: calendarFeed.created_at.toISOString(),
          lastReadAt: iso(calendarFeed.last_read_at),
        }
      : null,
    // What you set Caishy to keep, and what it kept or you saved (PRD §69).
    automations: automations.map((a) => {
      const view = automationView(a);
      return {
        name: view.name,
        description: view.description,
        when: view.when,
        collection: view.collection,
        enabled: view.enabled,
        runs: view.runs,
        lastRunAt: view.lastRunAt,
        createdAt: view.createdAt,
      };
    }),
    saved: saved.map((s) => {
      const v = kept.get(s.id);
      return {
        collection: s.collection,
        savedAt: s.created_at.toISOString(),
        conversationId: s.conversation_id,
        messageId: s.message_id,
        stillVisible: Boolean(v),
        kept: v?.asset_kind
          ? {
              kind: v.asset_kind,
              file: v.file_id ? fileUrl(v.file_id) : null,
              link: v.file_id ? null : v.url,
            }
          : null,
      };
    }),
    // Your plan's billing, and Stripe's reference to you (kept as accounting law requires).
    billing: [...billing.values()].map(({ customer: c, plans }) => ({
      stripeCustomer: c.id,
      test: !c.livemode,
      since: c.created_at.toISOString(),
      closedAt: iso(c.closed_at),
      subscriptions: plans.map((s) => ({
        plan: s.plan,
        interval: s.interval,
        status: s.status,
        amount: s.amount,
        currency: s.currency,
        currentPeriodEnd: iso(s.current_period_end),
        cancelsAtPeriodEnd: s.cancel_at_period_end,
      })),
    })),
  };
}
