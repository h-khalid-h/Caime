/**
 * What was said in a call while Cai took notes (M16 F7, R82 (3)), loaded when it's opened from
 * the call's line: speaker by speaker, as each was heard, from when the reader joined (R85 (2)).
 * Each person may delete their own words; the others keep theirs. Whoever heard it all reads Cai's
 * write-up above them once the call is over (M16 F7e): what it was about, its topics, what was
 * decided and the next steps, each step already its person's to take. Someone who came in later
 * asks Cai to catch them up, or to find the follow-ups, on what they heard (M16 F7d), the catch-up
 * labelled and kept nowhere, the follow-ups offered as their own suggestions.
 */
import type { AiCatchUpView, CallNotesSummaryView } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { formatClock } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MessageCircleQuestion from 'lucide-react-native/icons/message-circle-question-mark';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Trash from 'lucide-react-native/icons/trash';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { type ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useReduceMotion } from '@/lib/motion';
import { useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { CallRecording } from './CallRecording';
import { stillWriting, type Turn, turnsOf, turnText } from './turns';

/** Where the catch-up's words came from (M17 I4): the lines, each a moment to play. */
const AnswerSources = lazy(() =>
  import('@/features/assist/AnswerSources').then((m) => ({ default: m.AnswerSources })),
);

const LoadFailed = lazyPart(() => import('@/ui/LoadFailed').then((m) => m.LoadFailed));
const AskCai = lazyPart(() => import('./AskCai').then((m) => m.AskCai));

/** A turn's words, and a mark where Cai is still writing part of it. */
function TurnWords({ turn }: { turn: Turn }) {
  const text = turnText(turn);
  if (text === null)
    return (
      <Text variant="body" color="textTertiary">
        {tr('Cai is still writing this…')}
      </Text>
    );
  return (
    <Text variant="body" auto selectable>
      {stillWriting(turn) ? `${text} …` : text}
    </Text>
  );
}

/** A moment of the call: pressed, the recording plays from it (M17 I13c); else only its time. */
function Moment({
  at,
  play,
  testID,
}: {
  at: string;
  play: ((at: string) => void) | null;
  testID: string;
}) {
  const { timeZone, locale } = useUserClock();
  const time = formatClock(at, timeZone, locale);
  if (!play)
    return (
      <Text variant="caption" color="textTertiary">
        {time}
      </Text>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('Play from {time}', { time })}
      onPress={() => play(at)}
      hitSlop={6}
      testID={testID}
    >
      <Text variant="caption" color="accentStrong">
        {time}
      </Text>
    </Pressable>
  );
}

type Part = { text: string; at: string | null };
/** A part as a copy cached before I13c holds it: its words alone. */
const partOf = (p: Part | string): Part => (typeof p === 'string' ? { text: p, at: null } : p);

/**
 * Cai's write-up of the call, as everyone who heard it all reads it (M16 F7e): each topic,
 * decision and step at the moment it came up, which plays the recording from there (M17 I13c).
 */
function WrittenNotes({
  notes,
  play,
}: {
  notes: CallNotesSummaryView;
  play: ((at: string) => void) | null;
}) {
  const t = useTheme();
  const section = (title: string, items: Part[], testID: string) =>
    items.length ? (
      <View style={{ gap: 4 }} testID={testID}>
        <Text variant="overline" color="textSecondary">
          {title}
        </Text>
        {items.map((item) => (
          <View key={item.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
            <Text variant="body" auto selectable style={{ flex: 1 }}>
              {`• ${item.text}`}
            </Text>
            {item.at ? <Moment at={item.at} play={play} testID={`${testID}-play`} /> : null}
          </View>
        ))}
      </View>
    ) : null;
  return (
    <View
      accessibilityLiveRegion="polite"
      testID="call-notes-written"
      style={{ padding: 12, borderRadius: t.radii.md, gap: 10, backgroundColor: t.c.surfaceMuted }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Sparkles size={13} color={t.c.accentStrong} />
        <Text variant="overline" color="accentStrong">
          {tr(notes.label || AI_LABEL)}
        </Text>
      </View>
      <Text variant="body" auto selectable>
        {notes.summary}
      </Text>
      {notes.topics.map((topic) => (
        <View key={topic.title} style={{ gap: 4 }} testID="call-notes-topic">
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
            <Text variant="label" auto style={{ flex: 1 }}>
              {topic.title}
            </Text>
            {topic.at ? <Moment at={topic.at} play={play} testID="call-notes-topic-play" /> : null}
          </View>
          {topic.points.map((point) => (
            <Text key={point} variant="body" auto selectable>
              {`• ${point}`}
            </Text>
          ))}
        </View>
      ))}
      {section(tr('Decided'), notes.decisions.map(partOf), 'call-notes-decided')}
      {section(
        tr('Next steps'),
        notes.nextSteps.map((s) => ({
          text: [s.who, s.what, s.due].filter(Boolean).join(' · '),
          at: s.at ?? null,
        })),
        'call-notes-next',
      )}
    </View>
  );
}

export function NotesSheet({
  callId,
  conversationId,
  found,
  open,
  onClose,
}: {
  callId: string;
  /** The call's own conversation, which a share of its recording never offers (M17 I13e). */
  conversationId: string;
  /** A line Search found (M17 I12a): its turn marked, and the sheet opened at it. */
  found?: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  // Where the found line's turn sits in the sheet: the lines' place, then the turn's in them.
  const scroll = useRef<ScrollView | null>(null);
  const [linesAt, setLinesAt] = useState<number | null>(null);
  const [foundAt, setFoundAt] = useState<number | null>(null);
  const target = linesAt !== null && foundAt !== null ? linesAt + foundAt : null;
  // Followed while the sheet settles (the recording above it arrives with the notes), then left
  // to whoever reads it.
  const firstMove = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const now = Date.now();
    firstMove.current ??= now;
    if (now - firstMove.current > 1500) return;
    scroll.current?.scrollTo({ y: Math.max(0, target - 12), animated: !reduceMotion });
  }, [target, reduceMotion]);
  const qc = useQueryClient();
  const notes = useQuery({
    queryKey: qk.callNotes(callId),
    queryFn: () => endpoints.callNotes(callId),
    enabled: open,
  });
  const lines = notes.data?.lines ?? [];
  const written = notes.data?.summary ?? null;
  // Recorded too (R114): the recording leads, the notes under it.
  const recording = notes.data?.recording ?? null;
  const recorded = recording !== null && recording.state !== 'deleted';
  // A moment of the notes, asked of the player beside them (M17 I13c), once the voices play.
  const [seek, setSeek] = useState<{ at: string; n: number } | null>(null);
  const playable = Boolean(
    recording?.parts.some((p) => p.kind === 'voices' && p.state === 'ready'),
  );
  const play = playable ? (at: string) => setSeek((s) => ({ at, n: (s?.n ?? 0) + 1 })) : null;
  const writingUp = notes.data?.summaryState === 'writing';
  const writing = lines.filter((l) => l.text === null).length;
  // Cai on what was said (M16 F7d), for whoever may use AI assist, once something was heard.
  const assisted = useSession((s) => Boolean(s.user?.aiEnabled && !s.user.minor));
  const heard = lines.some((l) => l.text !== null);
  const [caughtUp, setCaughtUp] = useState<AiCatchUpView | null>(null);
  const [busy, setBusy] = useState<'catch-up' | 'follow-ups' | null>(null);
  // A question typed to Cai about the call (M17 I13f), answered to this reader alone.
  const [asking, setAsking] = useState(false);
  const catchUp = async () => {
    setBusy('catch-up');
    try {
      setCaughtUp(await endpoints.catchUpCallNotes(callId));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const followUps = async () => {
    setBusy('follow-ups');
    try {
      const n = (await endpoints.callNoteFollowUps(callId)).found.length;
      toast(
        n
          ? trn(n, '{n} follow-up to review', '{n} follow-ups to review')
          : tr('Nothing new to follow up'),
      );
      void qc.invalidateQueries({ queryKey: qk.allSuggestions });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  // A turn's lines go together: the words someone sees as one paragraph are what they delete.
  const remove = async (turn: Turn) => {
    try {
      for (const line of turn.lines) await endpoints.deleteCallNoteLine(callId, line.id);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      await qc.invalidateQueries({ queryKey: qk.callNotes(callId) });
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      scrollRef={scroll}
      title={tr('Notes from the call')}
      subtitle={
        recorded
          ? tr(
              'Written by Cai from what was said, under each person’s name, beside the call’s recording. You can delete your own words.',
            )
          : tr(
              'Written by Cai from what was said, under each person’s name. Voices weren’t kept. You can delete your own words.',
            )
      }
    >
      {recording ? (
        <View style={{ marginBottom: 14 }}>
          <CallRecording
            callId={callId}
            conversationId={conversationId}
            recording={recording}
            seek={seek}
            play={play}
          />
        </View>
      ) : null}
      {notes.isPending ? (
        <SkeletonRows count={4} />
      ) : notes.isError && !notes.data ? (
        <LoadFailed
          title={tr('The notes couldn’t load')}
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : lines.length === 0 && recording ? null : lines.length === 0 ? (
        <EmptyState
          title={tr('Nothing was said while Cai took notes')}
          body={tr('Words that are still being written show here once they are.')}
        />
      ) : (
        <View
          style={{ gap: 14 }}
          testID="call-notes-lines"
          onLayout={found ? (e) => setLinesAt(e.nativeEvent.layout.y) : undefined}
        >
          {written ? <WrittenNotes notes={written} play={play} /> : null}
          {writingUp ? (
            <Text variant="caption" color="textTertiary" testID="call-notes-writing">
              {tr('Cai is writing the notes…')}
            </Text>
          ) : null}
          {assisted && heard ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button
                label={tr('Ask Cai')}
                icon={MessageCircleQuestion}
                size="sm"
                variant="secondary"
                onPress={() => setAsking(true)}
                testID="call-notes-ask"
              />
            </View>
          ) : null}
          {asking ? (
            <AskCai callId={callId} open={asking} onClose={() => setAsking(false)} play={play} />
          ) : null}
          {assisted && heard && !written && !writingUp ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  label={tr('Catch me up')}
                  icon={Sparkles}
                  size="sm"
                  variant="secondary"
                  loading={busy === 'catch-up'}
                  disabled={busy !== null}
                  onPress={() => void catchUp()}
                  testID="call-notes-catch-up"
                />
                <Button
                  label={tr('Find follow-ups')}
                  icon={ListChecks}
                  size="sm"
                  variant="secondary"
                  loading={busy === 'follow-ups'}
                  disabled={busy !== null}
                  onPress={() => void followUps()}
                  testID="call-notes-follow-ups"
                />
              </View>
              {caughtUp ? (
                <View
                  accessibilityLiveRegion="polite"
                  testID="call-notes-summary"
                  style={{
                    padding: 12,
                    borderRadius: t.radii.md,
                    gap: 6,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                >
                  {caughtUp.summary ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={13} color={t.c.accentStrong} />
                        <Text variant="overline" color="accentStrong">
                          {tr(caughtUp.label ?? AI_LABEL)}
                        </Text>
                      </View>
                      <Text variant="body" auto selectable>
                        {caughtUp.summary}
                      </Text>
                      {caughtUp.sources.length ? (
                        <Suspense fallback={null}>
                          <AnswerSources
                            sources={caughtUp.sources}
                            onOpen={(s) => {
                              if (s.kind === 'note' && play) play(s.at);
                            }}
                            testID="call-notes-source"
                          />
                        </Suspense>
                      ) : null}
                    </>
                  ) : (
                    <Text variant="body" color="textSecondary">
                      {tr('Nothing to catch up on yet.')}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
          {turnsOf(lines).map((turn) => {
            const isFound = Boolean(found && turn.lines.some((l) => l.id === found));
            return (
              <View
                key={turn.id}
                style={[
                  { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
                  isFound && {
                    backgroundColor: t.c.accentSoft,
                    borderRadius: t.radii.md,
                    margin: -6,
                    padding: 6,
                  },
                ]}
                testID={isFound ? 'call-notes-found' : 'call-notes-line'}
                onLayout={isFound ? (e) => setFoundAt(e.nativeEvent.layout.y) : undefined}
              >
                <Avatar
                  id={turn.speaker.id}
                  name={turn.speaker.displayName}
                  url={turn.speaker.avatarUrl}
                  size={32}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                    <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {turn.mine ? tr('You') : turn.speaker.displayName}
                    </Text>
                    <Moment at={turn.at} play={play} testID="call-notes-play-from" />
                  </View>
                  <TurnWords turn={turn} />
                </View>
                {turn.mine ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('Delete my words')}
                    onPress={() => void remove(turn)}
                    hitSlop={8}
                    testID="call-notes-delete"
                  >
                    <Trash size={18} color={t.c.textTertiary} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {writing ? (
            <Text variant="caption" color="textTertiary">
              {trn(
                writing,
                'Cai is still writing one of these.',
                'Cai is still writing {n} of these.',
              )}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
