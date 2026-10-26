/**
 * Everyone's own answer to a group's meeting (R123): Going or Not going for each person but its
 * organizer, the chosen one marked, and a time to suggest with Not going; a line of who's going,
 * who isn't and who hasn't answered, which opens the names; and, for its organizer, the times
 * suggested, each taken with one tap into the meeting's own change (which asks everyone again).
 * Loaded with a group's meeting card alone.
 */
import type { ConversationView, MessageView } from '@caime/core/api';
import { formatWhenAt } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import type { answersAmong } from '@caime/core/meeting-changes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));

export function MeetingAnswers({
  m,
  organizer,
  open,
  mine,
  amongOf,
  onUseTime,
}: {
  m: MessageView;
  /** Who organizes it: they're going, and hear each answer. */
  organizer: string | null;
  /** Still to be answered: asked or on, not over. */
  open: boolean;
  /**
   * The reader's own answer, and everyone else's sorted, read by the card (core's readers stay in
   * the card's chunk: imported here too, they'd move into the one every screen shares).
   */
  mine: 'going' | 'not_going' | null;
  amongOf: (others: readonly string[]) => ReturnType<typeof answersAmong>;
  /** Its organizer takes a time someone suggested into the meeting's change. */
  onUseTime: (at: string) => void;
}) {
  const qc = useQueryClient();
  const meId = useSession((s) => s.user?.id ?? '');
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [names, setNames] = useState(false);
  const people = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) =>
      d.conversation.participants
        .filter((p) => p.person.kind === 'human')
        .map((p) => ({ id: p.userId, name: p.person.displayName })),
  }).data;
  const others = (people ?? []).filter((p) => p.id !== organizer).map((p) => p.id);
  const among = amongOf(others);
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? '';
  const answer = async (going: boolean, at?: string) => {
    setBusy(going ? 'yes' : 'no');
    try {
      const res = await endpoints.answerMeeting(m.id, {
        going,
        ...(at ? { suggest: { at, hasTime: true } } : {}),
      });
      upsertMessage(qc, res.message);
      if (at) toast(tr('Suggested. They’ll see it on the card.'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const counts = [
    trn(among.going.length + (organizer ? 1 : 0), '{n} going', '{n} going'),
    among.notGoing.length ? trn(among.notGoing.length, '{n} not going', '{n} not going') : null,
    among.waiting.length
      ? trn(among.waiting.length, '{n} hasn’t answered', '{n} haven’t answered')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const answering = open && meId !== organizer && people !== undefined;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={tr('Shows who')}
        onPress={() => setNames(true)}
        testID="kit-answers"
      >
        <Text variant="caption" color="textSecondary">
          {counts}
        </Text>
      </Pressable>
      {answering ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            label={tr('Going')}
            size="sm"
            variant={mine === 'going' ? 'primary' : 'secondary'}
            selected={mine === 'going'}
            loading={busy === 'yes'}
            disabled={busy !== null}
            onPress={() => void answer(true)}
            testID="kit-going"
          />
          <Button
            label={tr('Not going')}
            size="sm"
            variant={mine === 'not_going' ? 'primary' : 'secondary'}
            selected={mine === 'not_going'}
            loading={busy === 'no'}
            disabled={busy !== null}
            onPress={() => void answer(false)}
            testID="kit-not-going"
          />
          {mine === 'not_going' ? (
            <Button
              label={tr('Suggest a time')}
              size="sm"
              variant="ghost"
              onPress={() => setSuggesting(true)}
              testID="kit-suggest-time"
            />
          ) : null}
        </View>
      ) : null}
      {open && meId === organizer
        ? among.suggested.map((s) => (
            <View
              key={s.userId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
            >
              <Text variant="caption" style={{ flex: 1, minWidth: 140 }}>
                {tr('{name} suggests {when}', {
                  name: nameOf(s.userId),
                  when: formatWhenAt(s.at, true, new Date(), timeZone, locale),
                })}
              </Text>
              <Button
                label={tr('Use this time')}
                size="sm"
                variant="secondary"
                onPress={() => onUseTime(s.at)}
                testID="kit-use-time"
              />
            </View>
          ))
        : null}
      {suggesting ? (
        <WhenSheet
          open
          onClose={() => setSuggesting(false)}
          title={tr('Suggest a time')}
          value={null}
          time="required"
          future
          onChange={(chosen: Chosen) =>
            void answer(false, instantOf(chosen, timeZone).toISOString())
          }
          testID="kit-suggest-time-sheet"
        />
      ) : null}
      <Sheet open={names} onClose={() => setNames(false)} title={tr('Who’s going')}>
        <View testID="kit-answers-sheet">
          {organizer ? <ListRow title={nameOf(organizer)} subtitle={tr('Proposed it')} /> : null}
          {among.going.map((id) => (
            <ListRow key={id} title={nameOf(id)} subtitle={tr('Going')} />
          ))}
          {among.notGoing.map((id) => (
            <ListRow key={id} title={nameOf(id)} subtitle={tr('Not going')} />
          ))}
          {among.waiting.map((id) => (
            <ListRow key={id} title={nameOf(id)} subtitle={tr('Hasn’t answered')} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
