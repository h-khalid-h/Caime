/**
 * What a person's own choices teach Caime (M11, core `learning.ts`): read when a suggestion is
 * made, from their last decisions on suggestions of the kind, the same person's first. Off for
 * anyone whose `learnFromChoices` preference is off; then nothing is learned or kept.
 */
import { type ChoiceHistory, LEARN_WINDOW, type Learned, leanFrom } from '@caime/core/learning';
import type { AppContext } from '../context';

export async function leanFor(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  kind: string,
  subjectUserId: string | null | undefined,
): Promise<Learned | null> {
  const user = await ctx.db
    .selectFrom('users')
    .select('preferences')
    .where('id', '=', userId)
    .executeTakeFirst();
  const prefs = (user?.preferences ?? {}) as { learnFromChoices?: boolean };
  if (prefs.learnFromChoices === false) return null;
  const recent = (limit: number, subject: string | null) =>
    ctx.db
      .selectFrom('suggestions')
      .select('status')
      .where('user_id', '=', userId)
      .where('kind', '=', kind)
      .where('status', 'in', ['accepted', 'dismissed'])
      .$if(subject !== null, (qb) => qb.where('subject_user_id', '=', subject!))
      .orderBy('resolved_at', 'desc')
      .limit(limit)
      .execute();
  const count = (rows: Array<{ status: string }>): ChoiceHistory => ({
    accepted: rows.filter((r) => r.status === 'accepted').length,
    dismissed: rows.filter((r) => r.status === 'dismissed').length,
  });
  const [ofKind, ofPerson] = await Promise.all([
    recent(LEARN_WINDOW.kind, null),
    subjectUserId ? recent(LEARN_WINDOW.person, subjectUserId) : Promise.resolve(null),
  ]);
  return leanFrom(ofPerson ? count(ofPerson) : null, count(ofKind));
}
