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
import Sparkles from 'lucide-react-native/icons/sparkles';
import Trash from 'lucide-react-native/icons/trash';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
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
import { stillWriting, type Turn, turnsOf, turnText } from './turns';

const LoadFailed = lazyPart(() => import('@/ui/LoadFailed').then((m) => m.LoadFailed));

/** Cai's write-up of the call, as everyone who heard it all reads it (M16 F7e). */
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

function WrittenNotes({ notes }: { notes: CallNotesSummaryView }) {
  const t = useTheme();
  const section = (title: string, items: string[], testID: string) =>
    items.length ? (
      <View style={{ gap: 4 }} testID={testID}>
        <Text variant="overline" color="textSecondary">
          {title}
        </Text>
        {items.map((item) => (
          <Text key={item} variant="body" auto selectable>
            {`• ${item}`}
          </Text>
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
          <Text variant="label" auto>
            {topic.title}
          </Text>
          {topic.points.map((point) => (
            <Text key={point} variant="body" auto selectable>
              {`• ${point}`}
            </Text>
          ))}
        </View>
      ))}
      {section(tr('Decided'), notes.decisions, 'call-notes-decided')}
      {section(
        tr('Next steps'),
        notes.nextSteps.map((s) => [s.who, s.what, s.due].filter(Boolean).join(' · ')),
        'call-notes-next',
      )}
    </View>
  );
}

export function NotesSheet({
  callId,
  open,
  onClose,
}: {
  callId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const notes = useQuery({
    queryKey: qk.callNotes(callId),
    queryFn: () => endpoints.callNotes(callId),
    enabled: open,
  });
  const lines = notes.data?.lines ?? [];
  const written = notes.data?.summary ?? null;
  const writingUp = notes.data?.summaryState === 'writing';
  const writing = lines.filter((l) => l.text === null).length;
  // Cai on what was said (M16 F7d), for whoever may use AI assist, once something was heard.
  const assisted = useSession((s) => Boolean(s.user?.aiEnabled && !s.user.minor));
  const heard = lines.some((l) => l.text !== null);
  const [caughtUp, setCaughtUp] = useState<AiCatchUpView | null>(null);
  const [busy, setBusy] = useState<'catch-up' | 'follow-ups' | null>(null);
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
      title={tr('Notes from the call')}
      subtitle={tr(
        'Written by Cai from what was said, under each person’s name. Voices weren’t kept. You can delete your own words.',
      )}
    >
      {notes.isPending ? (
        <SkeletonRows count={4} />
      ) : notes.isError && !notes.data ? (
        <LoadFailed
          title={tr('The notes couldn’t load')}
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : lines.length === 0 ? (
        <EmptyState
          title={tr('Nothing was said while Cai took notes')}
          body={tr('Words that are still being written show here once they are.')}
        />
      ) : (
        <View style={{ gap: 14 }} testID="call-notes-lines">
          {written ? <WrittenNotes notes={written} /> : null}
          {writingUp ? (
            <Text variant="caption" color="textTertiary" testID="call-notes-writing">
              {tr('Cai is writing the notes…')}
            </Text>
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
          {turnsOf(lines).map((turn) => (
            <View
              key={turn.id}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
              testID="call-notes-line"
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
                  <Text variant="caption" color="textTertiary">
                    {formatClock(turn.at, timeZone, locale)}
                  </Text>
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
          ))}
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
