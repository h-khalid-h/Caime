/**
 * What's coming up (PRD §41, §72): the meetings and appointments in someone's conversations,
 * read from their cards, for their calendar feed, a conversation's details and a space's page.
 * Only where they may still read it: a conversation they're in and let in (no request pending
 * or declined), never a private one, never a card deleted, or deleted by them for themselves.
 */
import type { UpcomingView } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';

export type CardKit = 'meeting' | 'appointment';

/** A card is agreed once accepted (a meeting) or confirmed (an appointment). */
const AGREED: Record<CardKit, string> = { meeting: 'accepted', appointment: 'confirmed' };
/** Asked, and not yet answered. */
const ASKED: Record<CardKit, string> = { meeting: 'proposed', appointment: 'requested' };

export interface CardAhead {
  messageId: string;
  conversationId: string;
  seq: number;
  kit: CardKit;
  title: string;
  at: Date;
  hasTime: boolean;
  durationMinutes: number | null;
  place: string | null;
  agreed: boolean;
  /** When it last changed: the last move on it, or when it was made or edited. */
  updated: Date;
}

/** A card's start, as prepareKitFields keeps it (core kit-cards.ts: `toISOString()`). */
const START = sql<string>`m.payload->'fields'->'start'->>'at'`;

export async function cardsAhead(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  opts: {
    from: Date;
    until: Date;
    limit: number;
    /** Only these conversations (a conversation's details, a space). */
    conversationIds?: string[];
    /** Only what's agreed, for a calendar; otherwise what's asked too. */
    agreedOnly?: boolean;
  },
): Promise<CardAhead[]> {
  if (opts.conversationIds && opts.conversationIds.length === 0) return [];
  const states = (kit: CardKit) => (opts.agreedOnly ? [AGREED[kit]] : [AGREED[kit], ASKED[kit]]);
  const rows = await ctx.db
    .selectFrom('messages as m')
    .innerJoin('participants as p', (j) =>
      j
        .onRef('p.conversation_id', '=', 'm.conversation_id')
        .on('p.user_id', '=', userId)
        .on('p.left_at', 'is', null),
    )
    .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
    .select(['m.id', 'm.conversation_id', 'm.seq', 'm.payload', 'm.created_at', 'm.edited_at'])
    .where('m.kind', '=', 'kit')
    .where('m.deleted_at', 'is', null)
    .where(sql`m.payload->>'kit'`, 'in', ['meeting', 'appointment'])
    .$if(Boolean(opts.conversationIds), (qb) =>
      qb.where('m.conversation_id', 'in', opts.conversationIds ?? []),
    )
    .where('c.privacy_class', '=', 'standard')
    .where((eb) =>
      eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
    )
    .where((eb) =>
      eb.or(
        (['meeting', 'appointment'] as const).map((kit) =>
          eb.and([
            eb(sql`m.payload->>'kit'`, '=', kit),
            eb(sql`m.payload->>'state'`, 'in', states(kit)),
          ]),
        ),
      ),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('hidden_messages as h')
            .select('h.message_id')
            .whereRef('h.message_id', '=', 'm.id')
            .where('h.user_id', '=', userId),
        ),
      ),
    )
    // When it is, as it's kept (always an ISO time, so compared as text): only what's in the
    // window, soonest first, however long ago each was planned.
    .where(START, '>=', opts.from.toISOString())
    .where(START, '<=', opts.until.toISOString())
    .orderBy(START, 'asc')
    .limit(opts.limit)
    .execute();
  const ahead: CardAhead[] = [];
  for (const row of rows) {
    const payload = (row.payload ?? {}) as {
      kit?: CardKit;
      title?: string;
      state?: string;
      fields?: {
        title?: unknown;
        start?: { at?: string; hasTime?: boolean };
        durationMinutes?: unknown;
        place?: unknown;
      };
      history?: Array<{ at?: string }>;
    };
    const kit = payload.kit;
    const at = payload.fields?.start?.at ? new Date(payload.fields.start.at) : null;
    if (!kit || !at || Number.isNaN(at.getTime()) || at < opts.from || at > opts.until) continue;
    const minutes = Number(payload.fields?.durationMinutes);
    const moved = payload.history?.at(-1)?.at;
    ahead.push({
      messageId: row.id,
      conversationId: row.conversation_id,
      seq: Number(row.seq),
      kit,
      title: payload.title || (kit === 'meeting' ? 'Meeting' : 'Appointment'),
      at,
      hasTime: payload.fields?.start?.hasTime !== false,
      durationMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      place: typeof payload.fields?.place === 'string' ? payload.fields.place : null,
      agreed: payload.state === AGREED[kit],
      updated: moved ? new Date(moved) : (row.edited_at ?? row.created_at),
    });
  }
  return ahead.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, opts.limit);
}

export function upcomingView(card: CardAhead): UpcomingView {
  return {
    messageId: card.messageId,
    conversationId: card.conversationId,
    seq: card.seq,
    kit: card.kit,
    title: card.title,
    at: card.at.toISOString(),
    hasTime: card.hasTime,
    durationMinutes: card.durationMinutes,
    place: card.place,
    agreed: card.agreed,
  };
}

/** Ahead, for a person reading their plans: from a little while ago (so what's on now shows). */
export function aheadWindow(now: Date): { from: Date; until: Date } {
  return {
    from: new Date(now.getTime() - 3 * 3_600_000),
    until: new Date(now.getTime() + 180 * 86_400_000),
  };
}
