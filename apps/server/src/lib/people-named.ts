/**
 * The people someone means by a name they typed ("what am I waiting for from Ana", M16 G11):
 * their connections and whoever they're in a chat or a group with now (never through a request
 * still waiting on them), by a word of the name
 * they go by, the nickname they were given, or their handle. A whole word wins over the start of
 * one ("Ana" is Ana Lopez before Anabel), and a name is compared as people type it, folded as
 * search folds it (`caime_fold`, M17 I5): without accents ("Ayse" finds Ayşe, "Helene" Hélène,
 * "isik" Işık) and with Arabic's letter forms as one ("احمد" finds "أحمد", "ليلي" finds "ليلى"). Only people (`kind = 'human'`), never anyone known only
 * through an organization's conversation, whose team the customer sees as the organization
 * (R15). One query. Search's own `resolvePeople` finds a part of any sender's name, as a search
 * finds words; this is for naming someone. `peopleMeant` is a name or, failing one, a
 * relationship ("my dentist"): whom Cai is asked about (G11) and whom it's asked to do something
 * for (G14).
 */
import { aboutRelationship, relationshipWords } from '@caime/core';
import { foldForFind } from '@caime/core/fold';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { foldSql } from './fold-sql';
import { escapeLike } from './text';

/** Whether a name holds what was typed as whole words, folded as search folds them (M17 I5). */
export const holdsWhole = (name: string | null, typed: string) =>
  Boolean(name) && ` ${foldForFind(name!)} `.includes(` ${foldForFind(typed)} `);

export interface NamedPerson {
  id: string;
  name: string;
}

export async function peopleNamed(
  ctx: Pick<AppContext, 'db'>,
  me: string,
  name: string,
  /** `whole`: only a name holding every word typed, never one that only starts so (G14). */
  { limit = 5, whole = false }: { limit?: number; whole?: boolean } = {},
): Promise<NamedPerson[]> {
  const typed = foldForFind(name.trim().replace(/^@/, '')).replace(/\s+/g, ' ');
  if (!typed) return [];
  const start = `${escapeLike(typed)}%`;
  const word = `% ${escapeLike(typed)}%`;
  const rows = await ctx.db
    .selectFrom('users as u')
    .leftJoin('connection_sides as s', (j) =>
      j.onRef('s.other_id', '=', 'u.id').on('s.owner_id', '=', me),
    )
    .select(['u.id', 'u.display_name', 'u.handle', 's.nickname'])
    // Their own people first, so the names compared are theirs alone, however many there are.
    .where('u.id', 'in', (eb) =>
      eb
        .selectFrom('connection_sides as cs')
        .innerJoin('connections as k', 'k.id', 'cs.connection_id')
        .select('cs.other_id as id')
        .where('cs.owner_id', '=', me)
        .where('k.status', '=', 'active')
        .union(
          eb
            .selectFrom('participants as a')
            .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
            .innerJoin('conversations as c', 'c.id', 'a.conversation_id')
            .select('b.user_id as id')
            .where('a.user_id', '=', me)
            .where('a.left_at', 'is', null)
            // Never through a request still waiting on them: a stranger isn't theirs yet.
            .where((w) =>
              w.or([w('a.request_state', 'is', null), w('a.request_state', '=', 'accepted')]),
            )
            .where('b.left_at', 'is', null)
            .where('c.kind', 'in', ['direct', 'group']),
        ),
    )
    .where('u.id', '<>', me)
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb(foldSql('u.display_name'), 'like', start),
        eb(foldSql('u.display_name'), 'like', word),
        eb(foldSql('s.nickname'), 'like', start),
        eb(foldSql('s.nickname'), 'like', word),
        sql<boolean>`u.handle::text ilike ${start}`,
      ]),
    )
    .orderBy('u.display_name')
    .limit(limit * 4)
    .execute();
  const wholly = rows.filter(
    (r) =>
      holdsWhole(r.display_name, typed) ||
      holdsWhole(r.nickname, typed) ||
      String(r.handle).toLowerCase() === typed,
  );
  return (wholly.length || whole ? wholly : rows)
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: r.display_name }));
}

/**
 * Whom someone means by the words: their own people by that name (`peopleNamed`), else, when the
 * words name a relationship ("my dentist", "مديري"), the people they keep that relationship
 * with, by its role (a doctor is one whichever sphere they were labelled in) or its sphere, or
 * by a label of their own written that way ("Boss"). At most five.
 */
export async function peopleMeant(
  ctx: Pick<AppContext, 'db'>,
  me: string,
  words: string,
): Promise<NamedPerson[]> {
  const named = await peopleNamed(ctx, me, words);
  if (named.length) return named;
  const relationship = aboutRelationship(words);
  const label = foldForFind(relationshipWords(words));
  if (!relationship && !label) return [];
  const rows = await ctx.db
    .selectFrom('relationships as r')
    .innerJoin('users as u', 'u.id', 'r.subject_id')
    .select(['u.id', 'u.display_name'])
    .distinct()
    .where('r.owner_id', '=', me)
    .where('r.status', '=', 'active')
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        ...(relationship?.role ? [eb('r.role', '=', relationship.role)] : []),
        ...(relationship && !relationship.role ? [eb('r.sphere', '=', relationship.sphere)] : []),
        ...(label ? [eb(foldSql('r.role_label'), '=', label)] : []),
      ]),
    )
    .orderBy('u.display_name')
    .limit(5)
    .execute();
  return rows.map((r) => ({ id: r.id, name: r.display_name }));
}
