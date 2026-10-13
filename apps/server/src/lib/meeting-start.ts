/**
 * "Starting now" (R83): at an agreed meeting's time, everyone in its conversation is told, and
 * the notification opens the meeting's join address, so the first tap joins its call. Only for a
 * meeting held on Caime (its Where empty: core `meetingVenue`) with a time, in a conversation
 * where a call can be made (direct or a group, never private), to its people who are in it.
 * One job per card and start, as the brief is (briefs.ts): a card moved to another time gets
 * another, and the old one finds the card elsewhere and does nothing; a job run late says
 * nothing once the meeting could no longer be joined.
 */

import { tr } from '@caime/core/i18n';
import { JOIN_LATE_MS, joinPath, meetingVenue } from '@caime/core/meetings';
import type { AppContext } from '../context';
import { enqueue, registerJob } from './jobs';
import { notify } from './notify';

const START_JOB = 'meeting.start';

interface Card {
  conversationId: string;
  seq: number;
  title: string;
  at: Date;
}

/** An accepted meeting held on Caime, with a time; null for anything else. */
async function meetingOf(ctx: AppContext, messageId: string): Promise<Card | null> {
  const row = await ctx.db
    .selectFrom('messages')
    .select(['conversation_id', 'seq', 'payload', 'kind', 'deleted_at'])
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (row?.kind !== 'kit' || row.deleted_at) return null;
  const p = (row.payload ?? {}) as {
    kit?: string;
    state?: string;
    title?: string;
    fields?: { title?: unknown; start?: { at?: string; hasTime?: boolean }; place?: unknown };
  };
  if (p.kit !== 'meeting' || p.state !== 'accepted') return null;
  // Moved to its own space (R84): its copy there is the one that starts.
  if ((p as { movedTo?: unknown }).movedTo) return null;
  if (meetingVenue(p.fields?.place) !== 'caime' || p.fields?.start?.hasTime === false) return null;
  const at = p.fields?.start?.at ? new Date(p.fields.start.at) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const title = p.title || (typeof p.fields?.title === 'string' && p.fields.title) || tr('Meeting');
  return { conversationId: row.conversation_id, seq: Number(row.seq), title, at };
}

/** Queued when a meeting is accepted (card-moves.ts), for its start. */
export async function queueMeetingStart(ctx: AppContext, messageId: string): Promise<void> {
  const card = await meetingOf(ctx, messageId);
  if (!card || card.at.getTime() <= ctx.now().getTime()) return;
  await enqueue(
    ctx,
    START_JOB,
    { messageId, at: card.at.toISOString() },
    {
      runAt: card.at,
      dedupeKey: `meeting-start:${messageId}:${card.at.toISOString()}`,
      maxAttempts: 2,
    },
  );
}

async function startJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const messageId = String(payload.messageId);
  const card = await meetingOf(ctx, messageId);
  // Moved, cancelled, held elsewhere or gone: nothing to say now; too late to join: nor then.
  if (!card || card.at.toISOString() !== String(payload.at)) return;
  if (ctx.now().getTime() > card.at.getTime() + JOIN_LATE_MS) return;
  const conversation = await ctx.db
    .selectFrom('conversations')
    .select(['kind', 'privacy_class'])
    .where('id', '=', card.conversationId)
    .executeTakeFirst();
  if (conversation?.privacy_class !== 'standard') return;
  if (conversation.kind !== 'direct' && conversation.kind !== 'group') return;
  // Its people still in it, who took it (not a request still asked, nor one refused).
  const people = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select('p.user_id')
    .where('p.conversation_id', '=', card.conversationId)
    .where('p.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
    )
    .execute();
  const path = joinPath(card.conversationId, card.seq, messageId);
  for (const { user_id: userId } of people) {
    await notify(ctx, {
      userId,
      kind: 'meeting',
      level: 'attention',
      title: () => tr('Starting now: {title}', { title: card.title }),
      body: () => tr('It’s time to join.'),
      groupKey: `meeting:${messageId}`,
      // It shows the card's title: it goes when the card does.
      quotes: [messageId],
      data: { conversationId: card.conversationId, messageId, path },
    });
  }
}

export function registerMeetingStartJob(): void {
  registerJob(START_JOB, startJob);
}
