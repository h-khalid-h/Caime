/**
 * Meetings and appointments kept on their own clock (R119, M17 I19c). A card's start is written
 * with the zone it was set in and its wall-clock minute there (core `card-clock.ts`); when the
 * time-zone rules this server runs on change (a new image brings a new tz database: Egypt brought
 * summer time back in 2023 with weeks of notice, Lebanon changed it within two days), the cards
 * still ahead are derived again from their clock, so a 10:00 in Cairo stays 10:00 in Cairo. Run
 * once a day and only when the rules changed (`process.versions.tz` against the last pass), over
 * the partial index of cards that keep a clock (migration 0160), a batch at a time; each moved
 * card is written under its row lock and followed as a moved time is: its people shown it, their
 * calendars put in step, an agreed one's brief and start notice queued for the new time, the
 * invitation of whoever has it by mail sent one sequence on. Nobody is notified: on its own clock
 * nothing moved.
 */
import { movedByItsClock } from '@caime/core/card-clock';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { queueBrief } from './briefs';
import { queueCalendarPush } from './calendar-push';
import { registerPeriodic } from './jobs';
import { queueCardUpdate } from './mail-out';
import { queueMeetingStart } from './meeting-start';
import { messageViews, participantsOf } from './messages';
import { readSetting, writeSetting } from './settings';

/** The tz database the last pass read the cards with. */
const TZ_SETTING = 'cards.rezone.tz';
const BATCH = 200;

type Start = { at?: unknown; zone?: unknown; local?: unknown };
type CardPayload = { kit?: string; state?: string; sequence?: number; fields?: { start?: Start } };

const agreed = (p: CardPayload) =>
  (p.kit === 'meeting' && p.state === 'accepted') ||
  (p.kit === 'appointment' && p.state === 'confirmed');

/**
 * Every card still ahead whose clock now reads another instant, moved to it; how many moved.
 * `force` reads them whatever the last pass's rules (the tests' runner).
 */
export async function rezoneCards(
  ctx: AppContext,
  opts: { force?: boolean } = {},
): Promise<number> {
  const rules = process.versions.tz ?? 'unknown';
  if (!opts.force && (await readSetting<string>(ctx.db, TZ_SETTING)) === rules) return 0;
  let moved = 0;
  let after: { at: Date; id: string } = {
    at: ctx.now(),
    id: '00000000-0000-0000-0000-000000000000',
  };
  for (;;) {
    const rows = await ctx.db
      .selectFrom('messages')
      .select(['id', 'card_start_at', 'payload'])
      .where(sql<boolean>`(payload->'fields'->'start'->>'local') is not null`)
      .where(sql<boolean>`(card_start_at, id) > (${after.at}, ${after.id})`)
      .where('deleted_at', 'is', null)
      .orderBy('card_start_at')
      .orderBy('id')
      .limit(BATCH)
      .execute();
    for (const r of rows) {
      const start = (r.payload as CardPayload | null)?.fields?.start;
      if (start && movedByItsClock(start) && (await rezoneCard(ctx, r.id))) moved += 1;
    }
    const last = rows.at(-1);
    if (rows.length < BATCH || !last?.card_start_at) break;
    after = { at: new Date(last.card_start_at), id: last.id };
  }
  if (moved) ctx.metrics.cardsRezoned.inc({}, moved);
  await writeSetting(ctx.db, TZ_SETTING, rules, ctx.now());
  return moved;
}

/** One card moved to where its clock now falls, under its lock; false when nothing moved. */
async function rezoneCard(ctx: AppContext, id: string): Promise<boolean> {
  const row = await ctx.db.transaction().execute(async (trx) => {
    const now = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    const card = (now?.payload ?? {}) as CardPayload;
    const start = card.fields?.start;
    const to = start ? movedByItsClock(start) : null;
    if (!now || now.deleted_at || !start || !to) return null;
    const next = {
      fields: { ...card.fields, start: { ...start, at: to.toISOString() } },
      // A calendar that has it by mail takes the new instant as the invitation's next version.
      sequence: (card.sequence ?? 0) + 1,
    };
    return trx
      .updateTable('messages')
      .set({ payload: sql`payload || ${JSON.stringify(next)}::jsonb`, card_start_at: to })
      .where('id', '=', id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  if (!row) return false;
  await followMoved(ctx, row);
  return true;
}

async function followMoved(ctx: AppContext, m: Message): Promise<void> {
  const p = (m.payload ?? {}) as CardPayload;
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((x) => x.user_id);
  const [view] = m.sender_id ? await messageViews(ctx.db, [m], m.sender_id) : [];
  if (view)
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
  await queueCalendarPush(ctx, members);
  if (agreed(p)) {
    await queueBrief(ctx, m.id);
    await queueMeetingStart(ctx, m.id);
  }
  // Nobody moved it: whoever has it by mail is sent it, its sender too (a page's booker).
  await queueCardUpdate(ctx, m, '');
}

export function registerCardZones(): void {
  registerPeriodic({
    name: 'cards-rezone',
    everyMs: 86_400_000,
    background: true,
    run: (ctx) => rezoneCards(ctx).then(() => undefined),
  });
}
