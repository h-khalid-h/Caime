/**
 * The people someone means by a name they typed ("what am I waiting for from Ana", M16 G11):
 * their connections and whoever they're in a chat or a group with now (never through a request
 * still waiting on them), by a word of the name
 * they go by, the nickname they were given, or their handle. A whole word wins over the start of
 * one ("Ana" is Ana Lopez before Anabel), and a name is compared as people type it: without
 * accents ("Ayse" finds Ayşe, "Helene" Hélène) and with Arabic's letter forms as one ("احمد"
 * finds "أحمد", "ليلي" finds "ليلى"). Only people (`kind = 'human'`), never anyone known only
 * through an organization's conversation, whose team the customer sees as the organization
 * (R15). One query. Search's own `resolvePeople` finds a part of any sender's name, as a search
 * finds words; this is for naming someone.
 */
import { foldArabic } from '@caime/core/fold';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { escapeLike } from './text';

/** Letters the database writes plainly before it compares, each with its plain letter. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ÀÁÂÃÄÅàáâãäå', 'AAAAAAaaaaaa'],
  ['Çç', 'Cc'],
  ['ÈÉÊËèéêë', 'EEEEeeee'],
  ['ÌÍÎÏİìíîïı', 'IIIIIiiiii'],
  ['Ññ', 'Nn'],
  ['ÒÓÔÕÖØòóôõöø', 'OOOOOOoooooo'],
  ['ÙÚÛÜùúûü', 'UUUUuuuu'],
  ['Ýýÿ', 'Yyy'],
  ['Şş', 'Ss'],
  ['Ğğ', 'Gg'],
  ['أإآٱ', 'اااا'],
  ['ى', 'ي'],
  ['ة', 'ه'],
];
/**
 * What `foldArabic` drops (Arabic's marks, U+064B to U+0670, and the tatweel), which the database
 * drops too: `translate` deletes a letter with no pair.
 */
const DROPPED = [...Array.from({ length: 0x0670 - 0x064b + 1 }, (_, i) => 0x064b + i), 0x0640]
  .map((code) => String.fromCharCode(code))
  .join('');
export const FOLD_FROM = PAIRS.map(([from]) => from).join('') + DROPPED;
export const FOLD_TO = PAIRS.map(([, to]) => to).join('');

/** A name as the query compares it, the way `FOLD_FROM` and `FOLD_TO` write it; case is `ilike`'s. */
export function plainName(name: string): string {
  return foldArabic(name.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC'))
    .replace(/ı/g, 'i')
    .replace(/Ø/g, 'O')
    .replace(/ø/g, 'o');
}

/** A column as the query compares it: `plainName`'s letters, written by the database. */
export const plainColumn = (column: string) =>
  sql<string>`translate(${sql.ref(column)}, ${FOLD_FROM}, ${FOLD_TO})`;

/** Whether a name holds what was typed as whole words, as the reader compares them. */
const holdsWhole = (name: string | null, typed: string) =>
  Boolean(name) && ` ${plainName(name!).toLowerCase()} `.includes(` ${typed.toLowerCase()} `);

export interface NamedPerson {
  id: string;
  name: string;
}

export async function peopleNamed(
  ctx: Pick<AppContext, 'db'>,
  me: string,
  name: string,
  limit = 5,
): Promise<NamedPerson[]> {
  const typed = plainName(name.trim().replace(/^@/, '')).replace(/\s+/g, ' ');
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
        eb(plainColumn('u.display_name'), 'ilike', start),
        eb(plainColumn('u.display_name'), 'ilike', word),
        eb(plainColumn('s.nickname'), 'ilike', start),
        eb(plainColumn('s.nickname'), 'ilike', word),
        sql<boolean>`u.handle::text ilike ${start}`,
      ]),
    )
    .orderBy('u.display_name')
    .limit(limit * 4)
    .execute();
  const whole = rows.filter(
    (r) =>
      holdsWhole(r.display_name, typed) ||
      holdsWhole(r.nickname, typed) ||
      String(r.handle).toLowerCase() === typed.toLowerCase(),
  );
  return (whole.length ? whole : rows)
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: r.display_name }));
}
