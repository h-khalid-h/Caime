/**
 * A meeting's short address (M16 F6d): `cai.me/m/xxx-xxxx-xxx` (core `meetingCodePath`), ten
 * letters for a card held on Caime, made the first time a calendar is written its event (the
 * push, the feed: `meetingCodesFor`, one query for the set and one for the new) and gone with the
 * card. It's what a calendar shows and opens, on one line where the conversation's own address
 * took four. Opened (`GET /meeting-links/:code`, `meetingByCode`), it leads someone in the card's
 * conversation to the card and its call, and anyone else nowhere, in the same words as a code
 * nobody holds; nothing in it names anyone. Counted on `caime_meeting_links_total`.
 */
import { randomInt } from 'node:crypto';
import type { MeetingLinkResponse } from '@caime/core';
import { tr } from '@caime/core/i18n';
import {
  MEETING_CODE_LENGTH,
  MEETING_CODE_LETTERS,
  meetingCodeIn,
} from '@caime/core/meeting-codes';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { notesOf } from './call-cards';
import { notFound } from './errors';
import { readableBy } from './messages';

function newCode(): string {
  let code = '';
  for (let i = 0; i < MEETING_CODE_LENGTH; i++)
    code += MEETING_CODE_LETTERS[randomInt(MEETING_CODE_LETTERS.length)];
  return code;
}

/** Each card's code, made for those without one. */
export async function meetingCodesFor(
  ctx: AppContext,
  messageIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(messageIds)];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const read = async (which: string[]) => {
    const rows = await ctx.db
      .selectFrom('meeting_codes')
      .select(['message_id', 'code'])
      .where('message_id', 'in', which)
      .execute();
    for (const r of rows) out.set(r.message_id, r.code);
  };
  await read(ids);
  // A code another run made at the same moment, or one already taken by another card: read
  // again and made anew, a few times at most (ten letters of 24 rarely meet).
  for (let tries = 0; tries < 3; tries++) {
    const missing = ids.filter((id) => !out.has(id));
    if (missing.length === 0) break;
    const made = await ctx.db
      .insertInto('meeting_codes')
      .values(missing.map((id) => ({ message_id: id, code: newCode() })))
      .onConflict((oc) => oc.doNothing())
      .returning(['message_id', 'code'])
      .execute();
    for (const r of made) out.set(r.message_id, r.code);
    const left = missing.filter((id) => !out.has(id));
    if (left.length) await read(left);
  }
  return out;
}

/** Where a code leads its reader: the card in their conversation, still there to them. */
export async function meetingByCode(
  ctx: AppContext,
  userId: string,
  written: string,
): Promise<MeetingLinkResponse> {
  const code = meetingCodeIn(written);
  const row = code
    ? await ctx.db
        .selectFrom('meeting_codes as mc')
        .innerJoin('messages', 'messages.id', 'mc.message_id')
        .innerJoin('participants as p', (j) =>
          j
            .onRef('p.conversation_id', '=', 'messages.conversation_id')
            .on('p.user_id', '=', userId)
            .on('p.left_at', 'is', null),
        )
        .select(['messages.id', 'messages.conversation_id', 'messages.seq'])
        .where('mc.code', '=', code)
        .where('messages.kind', '=', 'kit')
        .where(sql<boolean>`messages.payload->>'kit' in ('meeting', 'appointment')`)
        .where(readableBy(userId, ctx.now()))
        .executeTakeFirst()
    : undefined;
  ctx.metrics.meetingLinks.inc({ outcome: row ? 'opened' : 'refused' });
  // One answer for a code nobody holds and one that isn't theirs, so codes can't be probed.
  if (!row) throw notFound(tr('That meeting'));
  // Once its call is over and Cai's notes of it are written, the address leads to them (M16 F6e).
  const notes = (await notesOf(ctx, userId, [row.id])).get(row.id);
  return {
    conversationId: row.conversation_id,
    seq: Number(row.seq),
    messageId: row.id,
    notes: notes ?? null,
  };
}
