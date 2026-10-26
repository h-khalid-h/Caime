/**
 * Search's engine (R17, PRD §25): what the rules or the model read of a query, run over what the
 * searcher may read (`readableBy`, `notHiddenFor`, a token's `openIn`), answered as
 * `SearchResults`. Shared by the search route, "Ask Cai" in Search and Cai's chat (M17 I4), so
 * whatever search leaves out, no answer ever sees.
 */
import type { ParsedQuery, SearchResponse, SearchResults } from '@caime/core';
import { foldForFind } from '@caime/core/fold';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { maskId, masksFor } from './business';
import { titleWithGroup } from './conversations';
import {
  foldedPrefixQuery,
  foldSql,
  messageTextSql,
  messageVectorSql,
  noteLineVectorSql,
  titleNotesVectorSql,
} from './fold-sql';
import { markSnippet, relevance } from './found-text';
import { openIn } from './member-apps';
import { fileView, notHiddenFor, readableBy } from './messages';
import { personViewsFor } from './people-batch';
import { relationshipView } from './relations';
import { visibleTasksSql } from './task-visibility';
import { taskViews } from './tasks';
import { escapeLike } from './text';

/** Anywhere in a field, what's typed taken literally (its `%` and `_` too). */
const like = (s: string) => `%${escapeLike(s)}%`;

/**
 * Anywhere in a field folded as the database folds (`foldSql`), what's typed folded the same way
 * (M17 I5): "احمد" finds "أحمد", "isik" finds "Işık", "cafe" finds "Café".
 */
const folded = (s: string) => like(foldForFind(s));

/** A handle starts with what's typed, its "@" aside. */
const handleStarts = (s: string) => `${escapeLike(s.replace(/^@/, ''))}%`;

/**
 * The newest messages that match the words, read to rank: the order is the best answer first
 * (`relevance`), among these, so a person with years of messages pays for a page, never all.
 */
const RANK_WINDOW = 100;
/** Characters of a message read for its snippet and its rank. */
const RANK_CHARS = 2000;

/** Resolve a name in the query to people the searcher knows (connections or conversation partners). */
async function resolvePeople(ctx: AppContext, me: string, name: string): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('users as u')
    .leftJoin('connection_sides as s', (j) =>
      j.onRef('s.other_id', '=', 'u.id').on('s.owner_id', '=', me),
    )
    .select('u.id')
    .where('u.id', '<>', me)
    .where((eb) =>
      eb.or([
        eb(foldSql('u.display_name'), 'like', folded(name)),
        eb(foldSql('s.nickname'), 'like', folded(name)),
        sql<boolean>`u.handle::text ilike ${handleStarts(name)}`,
      ]),
    )
    .where((eb) =>
      eb.or([
        eb('s.owner_id', 'is not', null),
        eb.exists(
          eb
            .selectFrom('participants as a')
            .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
            .select('a.conversation_id')
            .where('a.user_id', '=', me)
            .whereRef('b.user_id', '=', 'u.id'),
        ),
      ]),
    )
    .limit(10)
    .execute();
  return rows.map((r) => r.id);
}

export async function runSearch(
  ctx: AppContext,
  me: string,
  parsed: ParsedQuery,
  limit = 20,
  closed: readonly string[] = [],
  /** One conversation of the searcher's (M16 E6): its messages alone. */
  within: string | null = null,
): Promise<SearchResponse> {
  const scope = within ? 'messages' : parsed.scope;
  // What an organization keeps from its members' own apps stays out of a token's search (M16 G3).
  const keeps = closed.length > 0;
  const open = (column: string) => openIn(me, closed, sql.ref(column));
  const want = (s: ParsedQuery['scope']) => scope === 'all' || scope === s;
  const personIds = parsed.person ? await resolvePeople(ctx, me, parsed.person) : null;
  const text = parsed.text;
  const results: SearchResults = {};

  if (want('people') && (text || parsed.relationship)) {
    const rels = await ctx.db
      .selectFrom('relationships as r')
      .innerJoin('users as u', 'u.id', 'r.subject_id')
      .leftJoin('connection_sides as s', (j) =>
        j.onRef('s.other_id', '=', 'r.subject_id').on('s.owner_id', '=', me),
      )
      .selectAll('r')
      .where('r.owner_id', '=', me)
      .where('r.status', '=', 'active')
      .where('u.deleted_at', 'is', null)
      .$if(Boolean(parsed.relationship), (qb) =>
        qb
          .where('r.sphere', '=', parsed.relationship!.sphere)
          .$if(Boolean(parsed.relationship!.role), (q2) =>
            q2.where('r.role', '=', parsed.relationship!.role!),
          ),
      )
      .$if(Boolean(text) && !parsed.relationship, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb(foldSql('u.display_name'), 'like', folded(text)),
            eb(foldSql('s.nickname'), 'like', folded(text)),
            eb(foldSql('r.org_name'), 'like', folded(text)),
            eb(foldSql('r.role_label'), 'like', folded(text)),
            sql<boolean>`u.handle::text ilike ${handleStarts(text)}`,
          ]),
        ),
      )
      .orderBy('r.is_primary', 'desc')
      .limit(limit * 2)
      .execute();
    // Connections without a relationship still match by name.
    const unclassified =
      !parsed.relationship && text
        ? await ctx.db
            .selectFrom('connection_sides as s')
            .innerJoin('connections as c', 'c.id', 's.connection_id')
            .innerJoin('users as u', 'u.id', 's.other_id')
            .select('u.id')
            .where('s.owner_id', '=', me)
            .where('c.status', '=', 'active')
            .where((eb) =>
              eb.or([
                eb(foldSql('u.display_name'), 'like', folded(text)),
                eb(foldSql('s.nickname'), 'like', folded(text)),
              ]),
            )
            .limit(limit)
            .execute()
        : [];
    const ids = [
      ...new Set([...rels.map((r) => r.subject_id), ...unclassified.map((u) => u.id)]),
    ].slice(0, limit);
    const views = await personViewsFor(ctx, me, ids);
    results.people = ids.flatMap((id) => {
      const person = views.get(id);
      if (!person) return [];
      const rel =
        rels.find((r) => r.subject_id === id && r.is_primary) ??
        rels.find((r) => r.subject_id === id);
      return [{ person, relationship: rel ? relationshipView(rel, person.gender) : null }];
    });
    // Organizations are the "org" part of relationships: "DATA C" finds everyone there.
    if (text && !parsed.relationship) {
      const orgs = await ctx.db
        .selectFrom('relationships')
        .select([
          sql<string>`min(org_name)`.as('org_name'),
          sql<number>`count(distinct subject_id)::int`.as('people'),
        ])
        .where('owner_id', '=', me)
        .where('status', '=', 'active')
        .where(foldSql('org_name'), 'like', folded(text))
        // One organization however its name was written.
        .groupBy(foldSql('org_name'))
        .limit(5)
        .execute();
      // And the organizations written to (a clinic, a shop): their conversation opens.
      const written = await ctx.db
        .selectFrom('business_threads as t')
        .innerJoin('organizations as o', 'o.id', 't.org_id')
        .select(['o.name', 'o.handle', 't.conversation_id'])
        .where('t.customer_id', '=', me)
        .where(foldSql('o.name'), 'like', folded(text))
        .$if(keeps, (qb) => qb.where(open('t.conversation_id')))
        .orderBy('t.updated_at', 'desc')
        .limit(5)
        .execute();
      results.organizations = [
        ...written.map((w) => ({
          name: w.name,
          people: 0,
          handle: w.handle,
          conversationId: w.conversation_id,
        })),
        ...orgs
          .filter(
            (o) => !written.some((w) => foldForFind(w.name) === foldForFind(o.org_name ?? '')),
          )
          .map((o) => ({ name: o.org_name, people: o.people })),
      ];
    }
  }

  if (want('messages') && (text || personIds)) {
    if (personIds && personIds.length === 0) results.messages = [];
    else {
      const rows = await ctx.db
        .selectFrom('messages as m')
        // A time ("last week", "in March") is when it was written, or, for a card, when it's for.
        .$if(Boolean(parsed.period), (qb) =>
          qb.where((eb) =>
            eb.or([
              eb.and([
                eb('m.created_at', '>=', new Date(parsed.period!.since)),
                eb('m.created_at', '<', new Date(parsed.period!.until)),
              ]),
              eb.and([
                eb('m.kind', '=', 'kit'),
                eb('m.card_start_at', '>=', new Date(parsed.period!.since)),
                eb('m.card_start_at', '<', new Date(parsed.period!.until)),
              ]),
            ]),
          ),
        )
        .innerJoin('participants as p', (j) =>
          j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', me),
        )
        .$if(keeps, (qb) => qb.where(open('m.conversation_id')))
        .$if(Boolean(within), (qb) => qb.where('m.conversation_id', '=', within as string))
        .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
        .leftJoin('users as u', 'u.id', 'm.sender_id')
        .select([
          'm.id',
          'm.conversation_id',
          'm.seq',
          'm.sender_id',
          'm.created_at',
          'u.display_name as sender_name',
          'c.title as conversation_title',
          'c.kind as conversation_kind',
          text
            ? // Read to rank and to mark (`found-text.ts`). A card has no words: its title,
              // reference and summary stand in.
              sql<string>`left(coalesce(m.body, concat_ws(' · ', m.payload->>'title', m.payload->'fields'->>'reference', m.payload->'fields'->>'summary'), ''), ${RANK_CHARS})`.as(
                'snippet',
              )
            : sql<string>`left(coalesce(m.body, m.payload->>'title', ''), 140)`.as('snippet'),
        ])
        .where('p.left_at', 'is', null)
        // What the searcher may read (`readableBy`): a message deleted for oneself is gone from
        // one's own search too, and a disappearing one once its time has come.
        .where(readableBy(me, ctx.now(), 'm'))
        .where('c.privacy_class', '=', 'standard')
        .where('m.kind', '<>', 'system')
        // Words as prefixes against the folded index (M17 I5: "contr" finds "contract", "احمد"
        // finds "أحمد", "عرض" finds "العرض"); only a query too short to index (one or two
        // characters) falls back to a substring of the folded text.
        .$if(Boolean(text), (qb) =>
          qb.where((eb) =>
            text.length >= 3 && foldedPrefixQuery(text)
              ? sql<boolean>`${messageVectorSql('m')} @@ to_tsquery('simple', ${foldedPrefixQuery(text)})`
              : eb(messageTextSql('m'), 'like', folded(text)),
          ),
        )
        .$if(Boolean(personIds?.length), (qb) =>
          qb
            .where('m.sender_id', 'in', personIds!)
            // "From Sara" mustn't tell a customer who on an organization's team wrote (R15).
            .where((eb) => eb.or([eb('c.kind', '<>', 'business'), eb('p.role', '=', 'agent')])),
        )
        .orderBy('m.created_at', 'desc')
        .orderBy('m.id', 'desc')
        .limit(text ? RANK_WINDOW : limit)
        .execute();
      // The best answer first, a newer one before an older one that answers as well; then the
      // words marked where they were found.
      const now = ctx.now().getTime();
      const ranked = text
        ? rows
            .map((r) => ({ r, score: relevance(r.snippet, text, now - r.created_at.getTime()) }))
            .sort(
              (a, b) =>
                b.score - a.score ||
                b.r.created_at.getTime() - a.r.created_at.getTime() ||
                b.r.id.localeCompare(a.r.id),
            )
            .slice(0, limit)
            .map(({ r }) => ({ ...r, snippet: markSnippet(r.snippet, text) }))
        : rows;
      const masks = await masksFor(
        ctx,
        me,
        ranked.filter((r) => r.conversation_kind === 'business').map((r) => r.conversation_id),
      );
      results.messages = ranked.map((r) => {
        const mask = masks.get(r.conversation_id);
        const masked = mask && r.sender_id !== me;
        return {
          id: r.id,
          conversationId: r.conversation_id,
          seq: Number(r.seq),
          senderId: mask ? maskId(mask, r.sender_id) : r.sender_id,
          senderName: masked ? mask.orgName : r.sender_name,
          conversationTitle: mask
            ? mask.orgName
            : r.conversation_kind === 'direct'
              ? null
              : r.conversation_title,
          snippet: r.snippet,
          createdAt: r.created_at.toISOString(),
        };
      });
    }
  }

  // What was said in calls they were in (M17 I12a), by the notes' own rule (`readersOf`,
  // `notesFor`): a heard line said once they were in the call (its caller from the ring, whoever
  // answered from then, a group's member from their latest join) or said by them, the call's line
  // still theirs to read in a conversation they're still in. Words said are found with the
  // messages, never inside one conversation's search, which reads its messages alone.
  if (want('messages') && !within && (text || personIds)) {
    if (personIds && personIds.length === 0) results.calls = [];
    else {
      const rows = await ctx.db
        .selectFrom('call_note_lines as l')
        .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
        .innerJoin('calls as k', 'k.id', 'n.call_id')
        .innerJoin('messages as line', 'line.id', 'n.message_id')
        .innerJoin('participants as p', (j) =>
          j.onRef('p.conversation_id', '=', 'line.conversation_id').on('p.user_id', '=', me),
        )
        .innerJoin('conversations as c', 'c.id', 'line.conversation_id')
        .leftJoin('call_members as cm', (j) =>
          j.onRef('cm.call_id', '=', 'k.id').on('cm.user_id', '=', me),
        )
        .leftJoin('users as u', 'u.id', 'l.speaker_id')
        .select([
          'l.id',
          'l.speaker_id',
          'l.spoken_at',
          'k.id as call_id',
          'line.conversation_id',
          'line.seq',
          'u.display_name as speaker_name',
          'c.title as conversation_title',
          'c.kind as conversation_kind',
          sql<string>`left(coalesce(l.body, ''), ${RANK_CHARS})`.as('snippet'),
        ])
        .where('l.state', '=', 'heard')
        .where('p.left_at', 'is', null)
        .where(readableBy(me, ctx.now(), 'line'))
        .where('c.privacy_class', '=', 'standard')
        // Cai takes no notes in a customer's conversation (`assertNotesAllowed`); were it to, the
        // mask (R15) would have to come here with it.
        .where('c.kind', '<>', 'business')
        .$if(keeps, (qb) => qb.where(open('line.conversation_id')))
        .where((eb) => {
          const fromOrMine = (from: 'k.created_at' | 'k.answered_at' | 'cm.joined_at') =>
            eb.or([eb('l.spoken_at', '>=', eb.ref(from)), eb('l.speaker_id', '=', me)]);
          return eb.or([
            eb.and([
              eb('k.is_group', '=', false),
              eb('k.answered_at', 'is not', null),
              eb.or([
                eb.and([eb('k.caller_id', '=', me), fromOrMine('k.created_at')]),
                eb.and([eb('k.callee_id', '=', me), fromOrMine('k.answered_at')]),
              ]),
            ]),
            eb.and([
              eb('k.is_group', '=', true),
              eb('cm.joined_at', 'is not', null),
              fromOrMine('cm.joined_at'),
            ]),
          ]);
        })
        .$if(Boolean(parsed.period), (qb) =>
          qb
            .where('l.spoken_at', '>=', new Date(parsed.period!.since))
            .where('l.spoken_at', '<', new Date(parsed.period!.until)),
        )
        .$if(Boolean(text), (qb) =>
          qb.where((eb) =>
            text.length >= 3 && foldedPrefixQuery(text)
              ? sql<boolean>`${noteLineVectorSql('l')} @@ to_tsquery('simple', ${foldedPrefixQuery(text)})`
              : eb(foldSql(sql`coalesce(l.body, '')`), 'like', folded(text)),
          ),
        )
        .$if(Boolean(personIds?.length), (qb) => qb.where('l.speaker_id', 'in', personIds!))
        .orderBy('l.spoken_at', 'desc')
        .orderBy('l.id', 'desc')
        .limit(text ? RANK_WINDOW : limit)
        .execute();
      const now = ctx.now().getTime();
      const ranked = text
        ? rows
            .map((r) => ({ r, score: relevance(r.snippet, text, now - r.spoken_at.getTime()) }))
            .sort(
              (a, b) =>
                b.score - a.score ||
                b.r.spoken_at.getTime() - a.r.spoken_at.getTime() ||
                b.r.id.localeCompare(a.r.id),
            )
            .slice(0, limit)
            .map(({ r }) => ({ ...r, snippet: markSnippet(r.snippet, text) }))
        : rows;
      results.calls = ranked.map((r) => ({
        lineId: r.id,
        callId: r.call_id,
        conversationId: r.conversation_id,
        seq: Number(r.seq),
        speakerId: r.speaker_id,
        speakerName: r.speaker_name ?? tr('Deleted account'),
        conversationTitle: r.conversation_kind === 'direct' ? null : r.conversation_title,
        snippet: r.snippet,
        at: r.spoken_at.toISOString(),
      }));
    }
  }

  if (want('files') || want('links')) {
    const kinds =
      scope === 'links'
        ? ['link']
        : scope === 'files'
          ? parsed.fileKind === 'image'
            ? ['photo']
            : parsed.fileKind === 'video'
              ? ['video']
              : parsed.fileKind === 'audio'
                ? ['audio']
                : parsed.fileKind === 'document' || parsed.fileKind === 'pdf'
                  ? ['document']
                  : ['photo', 'video', 'audio', 'document']
          : ['photo', 'video', 'audio', 'document', 'link'];
    if (personIds && personIds.length === 0) results.files = [];
    else if (scope !== 'all' || text) {
      const rows = await ctx.db
        .selectFrom('assets as a')
        .$if(Boolean(parsed.period), (qb) =>
          qb
            .where('a.created_at', '>=', new Date(parsed.period!.since))
            .where('a.created_at', '<', new Date(parsed.period!.until)),
        )
        .innerJoin('participants as p', (j) =>
          j.onRef('p.conversation_id', '=', 'a.conversation_id').on('p.user_id', '=', me),
        )
        .$if(keeps, (qb) => qb.where(open('a.conversation_id')))
        .leftJoin('files as f', 'f.id', 'a.file_id')
        .select([
          'a.id',
          'a.kind',
          'a.url',
          'a.host',
          'a.title',
          'a.conversation_id',
          'a.message_id',
          'a.sender_id',
          'a.created_at',
          'f.id as file_id',
          'f.name',
          'f.mime',
          'f.size',
          'f.kind as file_kind',
          'f.width',
          'f.height',
          'f.duration_ms',
          'f.thumb_key',
        ])
        .where('a.kind', 'in', kinds as never)
        .where('p.left_at', 'is', null)
        .where(notHiddenFor(me, 'a.message_id'))
        .$if(parsed.fileKind === 'pdf', (qb) => qb.where('f.mime', '=', 'application/pdf'))
        .$if(Boolean(personIds?.length), (qb) =>
          qb
            .where('a.sender_id', 'in', personIds!)
            .where((eb) =>
              eb.or([
                eb.not(
                  eb.exists(
                    eb
                      .selectFrom('business_threads as t')
                      .select('t.conversation_id')
                      .whereRef('t.conversation_id', '=', 'a.conversation_id'),
                  ),
                ),
                eb('p.role', '=', 'agent'),
              ]),
            ),
        )
        .$if(Boolean(text) && scope === 'all', (qb) =>
          qb.where((eb) =>
            eb.or([eb(foldSql('a.title'), 'like', folded(text)), eb('a.url', 'ilike', like(text))]),
          ),
        )
        .orderBy('a.created_at', 'desc')
        .limit(limit)
        .execute();
      const fileMasks = await masksFor(
        ctx,
        me,
        rows.map((r) => r.conversation_id),
      );
      results.files = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        host: r.host,
        title: r.title,
        conversationId: r.conversation_id,
        messageId: r.message_id,
        senderId: (() => {
          const mask = fileMasks.get(r.conversation_id);
          return mask ? maskId(mask, r.sender_id) : r.sender_id;
        })(),
        createdAt: r.created_at.toISOString(),
        file: r.file_id
          ? fileView({
              id: r.file_id,
              name: r.name!,
              mime: r.mime!,
              size: r.size!,
              kind: r.file_kind!,
              width: r.width,
              height: r.height,
              duration_ms: r.duration_ms,
              thumb_key: r.thumb_key,
            })
          : null,
      }));
    }
  }

  if (want('tasks') || want('waiting') || (scope === 'all' && text)) {
    let q = ctx.db
      .selectFrom('tasks')
      .selectAll()
      .$if(Boolean(parsed.period), (qb) =>
        qb
          .where('created_at', '>=', new Date(parsed.period!.since))
          .where('created_at', '<', new Date(parsed.period!.until)),
      )
      .where(visibleTasksSql(me))
      .where('status', 'in', ['open', 'accepted'])
      // Nothing tied to a private conversation is searched on the server (R18, M16 G7).
      .where((eb) =>
        eb.or([
          eb('conversation_id', 'is', null),
          eb.not(
            eb.exists(
              eb
                .selectFrom('conversations as pc')
                .select('pc.id')
                .whereRef('pc.id', '=', 'tasks.conversation_id')
                .where('pc.privacy_class', '=', 'private'),
            ),
          ),
        ]),
      )
      .$if(keeps, (qb) =>
        qb.where((eb) => eb.or([eb('conversation_id', 'is', null), open('tasks.conversation_id')])),
      );
    if (scope === 'waiting')
      q = q.where('owner_id', '=', me).where('assignee_id', 'is distinct from', me);
    if (personIds) {
      if (personIds.length === 0) q = q.where(sql<boolean>`false`);
      else if (parsed.direction === 'asked_me' || scope === 'tasks') {
        // "Things Sarah asked me to do": her requests, and my tasks that came from her messages.
        q = q.where((eb) =>
          eb.or([
            eb.and([eb('owner_id', 'in', personIds), eb('assignee_id', '=', me)]),
            eb.and([
              eb('owner_id', '=', me),
              eb('assignee_id', '=', me),
              eb.exists(
                eb
                  .selectFrom('messages')
                  .select('id')
                  .whereRef('messages.id', '=', 'tasks.message_id')
                  .where('messages.sender_id', 'in', personIds),
              ),
            ]),
          ]),
        );
      } else if (parsed.direction === 'i_asked' || scope === 'waiting')
        q = q.where('assignee_id', 'in', personIds);
    }
    if (text && scope === 'all') {
      const words = foldedPrefixQuery(text);
      q = q.where(
        words
          ? sql<boolean>`${titleNotesVectorSql('tasks')} @@ to_tsquery('simple', ${words})`
          : sql<boolean>`false`,
      );
    }
    const rows = await q
      .orderBy(sql`due_at`, (ob) => ob.asc().nullsLast())
      .limit(limit)
      .execute();
    results.tasks = await taskViews(ctx, rows, me);
  }

  if (want('decisions') || (scope === 'all' && text)) {
    const rows = await ctx.db
      .selectFrom('decisions as d')
      .$if(Boolean(parsed.period), (qb) =>
        qb
          .where('d.decided_at', '>=', new Date(parsed.period!.since))
          .where('d.decided_at', '<', new Date(parsed.period!.until)),
      )
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'd.conversation_id').on('p.user_id', '=', me),
      )
      .innerJoin('conversations as dc', 'dc.id', 'd.conversation_id')
      .where('dc.privacy_class', '<>', 'private')
      .$if(keeps, (qb) => qb.where(open('d.conversation_id')))
      .select(['d.id', 'd.title', 'd.conversation_id', 'd.message_id', 'd.decided_at'])
      .where('p.left_at', 'is', null)
      .where('d.status', '=', 'active')
      .$if(Boolean(text), (qb) =>
        qb.where((eb) =>
          eb.or([
            ...(foldedPrefixQuery(text)
              ? [
                  sql<boolean>`${titleNotesVectorSql('d')} @@ to_tsquery('simple', ${foldedPrefixQuery(text)})`,
                ]
              : []),
            eb(foldSql('d.title'), 'like', folded(text)),
          ]),
        ),
      )
      .orderBy('d.decided_at', 'desc')
      .limit(limit)
      .execute();
    results.decisions = rows.map((d) => ({
      id: d.id,
      title: d.title,
      conversationId: d.conversation_id,
      messageId: d.message_id,
      decidedAt: d.decided_at.toISOString(),
    }));
  }

  if ((want('contexts') || scope === 'all') && text) {
    const rows = await ctx.db
      .selectFrom('conversations as c')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', me),
      )
      .$if(keeps, (qb) => qb.where(open('c.id')))
      .leftJoin('contexts as x', 'x.id', 'c.context_id')
      .select([
        'c.id',
        titleWithGroup('c').as('title'),
        'c.kind',
        'x.title as context_title',
        'x.kind as context_kind',
        'c.last_message_at',
      ])
      .where('p.left_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb(foldSql('c.title'), 'like', folded(text)),
          eb(foldSql('x.title'), 'like', folded(text)),
        ]),
      )
      .orderBy('c.last_message_at', (ob) => ob.desc().nullsLast())
      .limit(limit)
      .execute();
    results.contexts = rows.map((r) => ({
      conversationId: r.id,
      title: r.title ?? r.context_title,
      kind: r.kind,
      context: r.context_title ? { title: r.context_title, kind: r.context_kind } : null,
    }));
  }

  return {
    query: parsed,
    interpretation: parsed.interpretation,
    results,
    understoodBy: 'rules',
    label: null,
  };
}
