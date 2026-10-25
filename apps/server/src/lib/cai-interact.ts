/**
 * Cai joins in a call (R114 (3), M17 I13g): "Answer, Cai joins in". With the notes on in that
 * mode, a line that calls Cai by name (core `calledCai`) is answered aloud in the call from what
 * the call shares, short (`SPOKEN_MAX`), in the language it was asked in; what is one person's
 * own (their open things, something to keep, something to do with their people) is done by the
 * rules Cai's chat uses and written to them alone (`call.cai.written`), never said aloud (R110).
 * Cai's words go to the voice provider (`ctx.tts`) and come back as sound the recorder's browser
 * plays into the call (`call.cai` to everyone; the sound served to that one device by
 * `GET /calls/:id/cai/:utteranceId`), and into the notes as Cai's own line, so the write-up reads
 * what everyone heard. A line heard while Cai spoke that repeats its words is a microphone's echo,
 * dropped. Cai introduces itself aloud once as it joins (R87). Everything is counted on the
 * asker's allowance as the notes are (R107); the sound is kept an hour for the recorder to fetch,
 * then swept. Asked about the screen (M17 I13h, R114 (1): core `asksAboutScreen`), Cai first asks
 * the recording device for a picture of the screen shown now (`call.cai.frame`), which that
 * device answers with one (`takeCaiFrame`, kept at `cai/frames/…` for this answer alone) or with
 * none (`noCaiFrame`); the answer comes from the first of the line's jobs to arrive (the picture,
 * or the wait of `FRAME_WAIT_MS`), which claims the line (`cai_answered_at`), so it's answered
 * once, and the picture goes as soon as it's answered. Never kept beyond that.
 */
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { chatAct, chatIntent, chatSave, SPOKEN_MAX, truncate, uuidv7 } from '@caime/core';
import { asksAboutScreen, calledCai, echoes } from '@caime/core/cai-call';
import { writtenIn } from '@caime/core/chat-intent';
import { tr } from '@caime/core/i18n';
import { CAI_ID } from '@caime/core/system-ids';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { AiError, languageName } from './ai';
import { runAi } from './ai-run';
import { FRAME_MAX_BYTES, shrinkFrame } from './call-frames';
import {
  callAudience,
  callById,
  callPeopleNames,
  registerInteractHooks,
  tellReaders,
} from './call-notes';
import { noteTranscript } from './call-notes-ai';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { inLanguage, languageOf } from './i18n';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { assertAiAllowance } from './plans';
import { forgetLater } from './speech-forget';
import { base64Of, storageFor } from './storage';
import { keepFromWords, type OpenPart, offerInChat, person, ruleAnswer } from './system-accounts';
import { transcriptClock } from './transcript';

export const CAI_JOB = 'call.cai';
export const CAI_INTRO_JOB = 'call.cai.intro';
/** How long an utterance's sound is kept for the recorder to fetch (a reconnect asks again). */
const UTTERANCE_KEPT_MS = 60 * 60_000;
/** Roughly how long spoken words take, for "Cai is speaking" until the sound itself says. */
const MS_PER_CHARACTER = 65;
const MIN_SPOKEN_MS = 1_500;
/** A line heard this close to an utterance may be its echo through a microphone. */
const ECHO_SLACK_MS = 2_000;
/** How long Cai waits for the recording device's picture of the screen before answering without it. */
export const FRAME_WAIT_MS = 10_000;

/** What Cai has of the screen for an answer (M17 I13h): a picture, none shown, or none in time. */
type Screen = { key: string } | 'none' | 'waited' | null;

const OWN: readonly OpenPart[] = ['waiting', 'asked', 'mine', 'coming'];

type Outcome =
  | 'spoken'
  | 'written'
  | 'saved'
  | 'offered'
  | 'no_answer'
  | 'echo'
  | 'allowance'
  | 'introduced'
  | 'failed'
  | 'screen_asked'
  | 'no_screen';

/** The notes on in a call with Cai joining in, or null. */
async function liveInteract(ctx: AppContext, callId: string) {
  return ctx.db
    .selectFrom('call_notes')
    .select(['id', 'started_by', 'recorder_id', 'recorder_device', 'introduced_at'])
    .where('call_id', '=', callId)
    .where('state', '=', 'on')
    .where('interacts', '=', true)
    .executeTakeFirst();
}

/** What Cai wrote to one person in the call, to their devices alone; kept nowhere. */
async function write(
  ctx: AppContext,
  call: Call,
  userId: string,
  text: string,
  open: 'cai' | null,
): Promise<void> {
  await ctx.bus.publish([userId], {
    type: 'call.cai.written',
    data: { callId: call.id, text, open },
  });
}

/**
 * Cai says something in the call: its words as sound from the voice provider, kept for the
 * recorder's browser to play, told to everyone in the call, and written into the notes as Cai's
 * line. Without a voice, or when the provider is away, the words go to the asker in writing.
 */
async function speak(
  ctx: AppContext,
  call: Call,
  notesId: string,
  payerId: string,
  askerId: string,
  text: string,
  language: string,
): Promise<boolean> {
  const tts = ctx.tts;
  if (!tts) {
    await write(ctx, call, askerId, text, null);
    return false;
  }
  const now = ctx.now();
  let sound: Awaited<ReturnType<typeof tts.speak>>['value'];
  try {
    sound = await runAi(ctx, 'speak', payerId, () => tts.speak({ text, language }), tts.provider);
  } catch (err) {
    if (!(err instanceof AppError) && !(err instanceof AiError)) throw err;
    await write(ctx, call, askerId, text, null);
    return false;
  }
  const id = uuidv7();
  const key = `cai/${call.id}/${id}.mp3`;
  await storageFor(ctx.config).write(key, Readable.from(sound.bytes));
  const ms = Math.max(MIN_SPOKEN_MS, text.length * MS_PER_CHARACTER);
  const until = new Date(now.getTime() + ms);
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('call_cai_utterances')
      .values({
        id,
        call_id: call.id,
        notes_id: notesId,
        text,
        storage_key: key,
        mime: sound.mime,
        spoken_from: now,
        spoken_until: until,
        // The sweep reads it on this clock, not the database's (a test moves it).
        created_at: now,
      })
      .execute();
    // Cai's own line in the notes: what everyone heard, read by the write-up as anyone's words.
    await trx
      .insertInto('call_note_lines')
      .values({
        id: uuidv7(),
        notes_id: notesId,
        speaker_id: CAI_ID,
        spoken_at: now,
        length_ms: ms,
        file_id: null,
        body: text,
        language,
        state: 'heard',
      })
      .execute();
  });
  await forgetLater(ctx, sound.ref, 'tts');
  await ctx.bus.publish(await callAudience(ctx, call), {
    type: 'call.cai',
    data: { callId: call.id, utteranceId: id, text, ms, until: until.toISOString() },
  });
  await tellReaders(ctx, call);
  return true;
}

/** A line heard while Cai spoke, saying Cai's words: a microphone's echo, out of the notes. */
async function isEcho(
  ctx: AppContext,
  call: Call,
  line: { id: string; body: string; spoken_at: Date },
): Promise<boolean> {
  const recent = await ctx.db
    .selectFrom('call_cai_utterances')
    .select('text')
    .where('call_id', '=', call.id)
    .where('spoken_from', '<=', new Date(line.spoken_at.getTime() + ECHO_SLACK_MS))
    .where('spoken_until', '>=', new Date(line.spoken_at.getTime() - ECHO_SLACK_MS))
    .execute();
  if (!recent.some((u) => echoes(line.body, u.text))) return false;
  await ctx.db
    .updateTable('call_note_lines')
    .set({ state: 'unheard', body: null })
    .where('id', '=', line.id)
    .execute();
  await tellReaders(ctx, call);
  return true;
}

/** What Cai answers, by the rules first (R110), else from the notes on the light model. */
/** Whether the rules answer a question without the model: then no picture of the screen is asked. */
function byRules(question: string): boolean {
  const intent = chatIntent(question);
  return Boolean(
    (intent && OWN.includes(intent as OpenPart)) || chatSave(question) || chatAct(question),
  );
}

async function answerCall(
  ctx: AppContext,
  call: Call,
  line: { notesId: string; speaker_id: string; started_by: string },
  question: string,
  screen: Screen = null,
): Promise<Outcome> {
  const asker = line.speaker_id;
  const payer = line.started_by;
  try {
    await assertAiAllowance(ctx, payer);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return 'allowance';
  }
  const language = writtenIn(question) ?? (await languageOf(ctx, asker));
  const say = (text: string) => speak(ctx, call, line.notesId, payer, asker, text, language);
  return inLanguage(language, async (): Promise<Outcome> => {
    // One person's own things are theirs alone: written to them, never said to the call.
    const intent = chatIntent(question);
    if (intent && OWN.includes(intent as OpenPart)) {
      const me = await person(ctx, asker);
      await write(ctx, call, asker, await ruleAnswer(ctx, me, intent as OpenPart), null);
      await say(tr('I’ve written that to you.'));
      return 'written';
    }
    if (chatSave(question)) {
      const kept = await keepFromWords(ctx, asker, question);
      await write(ctx, call, asker, kept.line, 'cai');
      await say(
        kept.kept ? tr('Saved to your actions.') : tr('Say what to keep after “remind me to”.'),
      );
      return 'saved';
    }
    const act = chatAct(question);
    if (act) {
      await offerInChat(ctx, asker, act);
      await write(ctx, call, asker, tr('I’ve prepared that in our chat, for you to send.'), 'cai');
      await say(tr('I’ve prepared that in our chat.'));
      return 'offered';
    }
    const ai = ctx.ai;
    if (!ai) {
      await say(tr('I can’t answer that here yet.'));
      return 'no_answer';
    }
    // Asked about the screen with none to look at (M17 I13h): said, never guessed from the notes.
    if ((screen === 'none' || screen === 'waited') && asksAboutScreen(question)) {
      await say(tr('I can’t see a screen right now.'));
      return 'no_screen';
    }
    const me = await person(ctx, asker);
    const { transcript, lines } = await noteTranscript(ctx, call, asker, me.time_zone);
    const image =
      screen && typeof screen === 'object'
        ? { data: await base64Of(ctx, screen.key), mediaType: 'image/jpeg' as const }
        : undefined;
    if (!lines.length && !image) {
      await say(tr('Nothing has been said yet for me to answer from.'));
      return 'no_answer';
    }
    const { answer } = await runAi(ctx, 'interact', payer, () =>
      ai.interact({
        transcript,
        question,
        language: languageName(language),
        today: transcriptClock(me.time_zone).day(ctx.now()),
        image,
      }),
    );
    await say(truncate(answer, SPOKEN_MAX));
    return 'spoken';
  });
}

/** A line heard with Cai joining in: an echo dropped, a call to Cai answered, else nothing. */
async function onLine(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const lineId = String(payload.lineId ?? '');
  if (!lineId) return;
  const line = await ctx.db
    .selectFrom('call_note_lines as l')
    .innerJoin('call_notes as n', 'n.id', 'l.notes_id')
    .select([
      'l.id',
      'l.body',
      'l.speaker_id',
      'l.spoken_at',
      'n.id as notesId',
      'n.call_id',
      'n.state',
      'n.interacts',
      'n.started_by',
    ])
    .where('l.id', '=', lineId)
    .executeTakeFirst();
  if (!line?.body || line.state !== 'on' || !line.interacts || !line.started_by) return;
  if (line.speaker_id === CAI_ID) return;
  const call = await callById(ctx.db, line.call_id);
  if (!call) return;
  const body = line.body;
  if (await isEcho(ctx, call, { id: line.id, body, spoken_at: line.spoken_at })) {
    ctx.metrics.caiInteract.inc({ outcome: 'echo' });
    return;
  }
  const asked = calledCai(body, await callPeopleNames(ctx.db, call));
  if (!asked) return;
  const screen: Screen =
    typeof payload.frameKey === 'string'
      ? { key: payload.frameKey }
      : payload.noScreen === true
        ? 'none'
        : payload.waited === true
          ? 'waited'
          : null;
  // Asked about the screen (M17 I13h): the recording device is asked for its picture first, once,
  // and the answer waits for it or for FRAME_WAIT_MS, whichever comes first.
  if (screen === null && ctx.ai && asksAboutScreen(asked.question) && !byRules(asked.question)) {
    const notes = await liveInteract(ctx, call.id);
    if (notes?.recorder_id && notes.recorder_device) {
      await ctx.bus.publish([notes.recorder_id], {
        type: 'call.cai.frame',
        data: { callId: call.id, lineId: line.id, deviceId: notes.recorder_device },
      });
      await enqueue(
        ctx,
        CAI_JOB,
        { lineId: line.id, waited: true },
        {
          runAt: new Date(ctx.now().getTime() + FRAME_WAIT_MS),
          dedupeKey: `${CAI_JOB}:${line.id}:waited`,
        },
      );
      ctx.metrics.caiInteract.inc({ outcome: 'screen_asked' });
      return;
    }
  }
  // Answered once: the first of the line's jobs to get here answers; a picture that comes later
  // goes unread.
  const storage = storageFor(ctx.config);
  const claimed = await ctx.db
    .updateTable('call_note_lines')
    .set({ cai_answered_at: ctx.now() })
    .where('id', '=', line.id)
    .where('cai_answered_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!claimed) {
    if (screen && typeof screen === 'object') await storage.remove(screen.key).catch(() => {});
    return;
  }
  const started = Date.now();
  let outcome: Outcome;
  try {
    outcome = await answerCall(
      ctx,
      call,
      { notesId: line.notesId, speaker_id: line.speaker_id, started_by: line.started_by },
      asked.question,
      screen,
    );
  } catch (err) {
    // Busy: the job tries again, the line its to answer again. Anything else is this one answer
    // lost, logged.
    if (err instanceof AppError && err.code === 'ai_busy') {
      await ctx.db
        .updateTable('call_note_lines')
        .set({ cai_answered_at: null })
        .where('id', '=', line.id)
        .execute();
      throw err;
    }
    ctx.log.warn({ err, callId: call.id }, 'cai could not answer in the call');
    outcome = 'failed';
  } finally {
    if (screen && typeof screen === 'object') await storage.remove(screen.key).catch(() => {});
  }
  ctx.metrics.caiInteract.inc({ outcome });
  ctx.metrics.caiInteractSeconds.observe({ outcome }, (Date.now() - started) / 1000);
}

/** The line Cai asked about the screen for, from the device it asked, while it still waits. */
async function askedLine(
  ctx: AppContext,
  call: Call,
  userId: string,
  deviceId: string,
  lineId: string,
) {
  const notes = await liveInteract(ctx, call.id);
  if (!notes || notes.recorder_id !== userId || notes.recorder_device !== deviceId)
    throw forbidden(tr('Only the device recording the call shows Cai the screen.'));
  const line = await ctx.db
    .selectFrom('call_note_lines')
    .select(['id', 'cai_answered_at'])
    .where('id', '=', lineId)
    .where('notes_id', '=', notes.id)
    .executeTakeFirst();
  if (!line) throw notFound(tr('That line'));
  return line;
}

/**
 * The recording device's picture of the screen shown now (M17 I13h), for the line that asked:
 * shrunk as a frame is, kept at a key of its own for this answer alone, and the answer queued.
 * One for a line already answered is let go.
 */
export async function takeCaiFrame(
  ctx: AppContext,
  call: Call,
  userId: string,
  frame: { deviceId: string; lineId: string; spool: string },
): Promise<boolean> {
  const line = await askedLine(ctx, call, userId, frame.deviceId, frame.lineId);
  if (line.cai_answered_at) return false;
  if ((await stat(frame.spool)).size > FRAME_MAX_BYTES)
    throw new AppError(413, 'too_large', tr('That picture of the screen is too large.'));
  const picture = await shrinkFrame(frame.spool);
  if (!picture) throw badRequest(tr('That isn’t a picture Caime reads.'));
  const key = `cai/frames/${call.id}/${line.id}.jpg`;
  await storageFor(ctx.config).write(key, Readable.from(picture.data));
  await enqueue(
    ctx,
    CAI_JOB,
    { lineId: line.id, frameKey: key },
    { dedupeKey: `${CAI_JOB}:${line.id}:framed` },
  );
  return true;
}

/** The recording device says no screen is shown (M17 I13h): Cai answers so at once. */
export async function noCaiFrame(
  ctx: AppContext,
  call: Call,
  userId: string,
  ask: { deviceId: string; lineId: string },
): Promise<boolean> {
  const line = await askedLine(ctx, call, userId, ask.deviceId, ask.lineId);
  if (line.cai_answered_at) return false;
  await enqueue(
    ctx,
    CAI_JOB,
    { lineId: line.id, noScreen: true },
    { dedupeKey: `${CAI_JOB}:${line.id}:framed` },
  );
  return true;
}

/** Cai introduces itself aloud once as it joins (R87): who it is, that it's an AI, what it does. */
async function introduce(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const callId = String(payload.callId ?? '');
  if (!callId) return;
  const notes = await liveInteract(ctx, callId);
  if (!notes || notes.introduced_at || !notes.started_by) return;
  const claimed = await ctx.db
    .updateTable('call_notes')
    .set({ introduced_at: ctx.now() })
    .where('id', '=', notes.id)
    .where('introduced_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!claimed) return;
  const call = await callById(ctx.db, callId);
  if (!call) return;
  const payer = notes.started_by;
  const language = await languageOf(ctx, payer);
  await inLanguage(language, () =>
    speak(
      ctx,
      call,
      notes.id,
      payer,
      payer,
      tr(
        'Hi, I’m Cai, Caime’s AI assistant. Say my name and I’ll answer from the call; whatever I say goes in the notes.',
      ),
      language,
    ),
  );
  ctx.metrics.caiInteract.inc({ outcome: 'introduced' });
}

/**
 * The sound of one utterance, for the device that plays it into the call: the notes' recorder,
 * on the device it records from; nobody else, and nothing once the notes are over.
 */
export async function utteranceFor(
  ctx: AppContext,
  call: Call,
  userId: string,
  deviceId: string,
  utteranceId: string,
): Promise<{ storage_key: string; mime: string }> {
  const notes = await liveInteract(ctx, call.id);
  if (!notes || notes.recorder_id !== userId || notes.recorder_device !== deviceId)
    throw forbidden(tr('Only the device recording the call plays Cai’s voice.'));
  const row = await ctx.db
    .selectFrom('call_cai_utterances')
    .select(['storage_key', 'mime'])
    .where('id', '=', utteranceId)
    .where('call_id', '=', call.id)
    .executeTakeFirst();
  if (!row?.storage_key) throw notFound(tr('That sound'));
  return { storage_key: row.storage_key, mime: row.mime };
}

/** The sound of what Cai said goes an hour after it was said; the words stay in the notes. */
async function sweepUtterances(ctx: AppContext): Promise<void> {
  const old = await ctx.db
    .deleteFrom('call_cai_utterances')
    .where('created_at', '<', new Date(ctx.now().getTime() - UTTERANCE_KEPT_MS))
    .where('storage_key', 'is not', null)
    .returning('storage_key')
    .execute();
  const storage = storageFor(ctx.config);
  for (const row of old) if (row.storage_key) await storage.remove(row.storage_key).catch(() => {});
}

export function registerCaiInteract(): void {
  registerJob(CAI_JOB, onLine, { timeoutMs: 60_000 });
  registerJob(CAI_INTRO_JOB, introduce, { timeoutMs: 60_000 });
  registerInteractHooks({
    lineHeard: (ctx, lineId) =>
      enqueue(ctx, CAI_JOB, { lineId }, { dedupeKey: `${CAI_JOB}:${lineId}` }),
    started: (ctx, callId) => enqueue(ctx, CAI_INTRO_JOB, { callId }),
  });
  registerPeriodic({
    name: 'cai-utterances',
    everyMs: 3_600_000,
    background: true,
    run: sweepUtterances,
  });
}
