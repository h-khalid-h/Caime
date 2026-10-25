/**
 * Cai's notes in a call (M16 F7, R85), and its recording (R114, M17 I13b), as the call screens
 * show them: the line that says they're on (an indicator everyone in the call sees the whole time,
 * R52), the ask to whoever it waits on (a labelled choice, never inferred: R85 (1)), and the
 * controls that ask for one or the other, or stop (anyone, any time: R85 (2)).
 */
import type { CallNotesView } from '@caime/core/api';
import { notesAsked, RECORDING_DAYS } from '@caime/core/calls';
import { joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Square from 'lucide-react-native/icons/square';
import { useState } from 'react';
import { View } from 'react-native';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { INK, OVER_VIDEO, Round } from './callUi';
import { answerNotes, askNotes, stopNotes } from './notes';

const first = (name: string) => name.split(' ')[0] || name;

/**
 * The control in a call's row: Cai, which offers Take notes or Record (R114 (1)), each saying what
 * it keeps, so whoever asks chooses knowing; while one is asked for (or another mode asked beside
 * it, M17 I13b2) it withdraws the ask; while one is on it offers the other mode (asked of everyone
 * again, the one under way going on until they have) and Stop. One round, so the row fits a phone.
 */
export function NotesRound({ notes, testID }: { notes: CallNotesView | null; testID: string }) {
  const [choosing, setChoosing] = useState(false);
  if (notes?.state === 'asking' || notes?.switching)
    return (
      <Round
        icon={(notes.switching?.records ?? notes.records) ? CircleDot : NotebookPen}
        label={tr('Stop asking')}
        on
        onPress={() => void stopNotes()}
        testID={testID}
      />
    );
  const on = notesAsked(notes);
  const ask = (records: boolean) => {
    setChoosing(false);
    void askNotes(records);
  };
  const stop = () => {
    setChoosing(false);
    void stopNotes();
  };
  return (
    <View>
      <Round
        icon={on && notes?.records ? CircleDot : NotebookPen}
        label={tr('Cai')}
        on={on || choosing}
        onPress={() => setChoosing((c) => !c)}
        testID={testID}
      />
      {choosing ? (
        <View
          accessibilityRole="menu"
          testID={`${testID}-choose`}
          style={{
            position: 'absolute',
            bottom: 96,
            // Centred over the round: equal on both sides.
            left: -88,
            width: 240,
            padding: 8,
            gap: 4,
            borderRadius: 16,
            backgroundColor: '#1F1D2BF2',
          }}
        >
          {on && notes ? (
            <>
              {notes.records ? (
                <Mode
                  icon={NotebookPen}
                  label={tr('Notes only')}
                  detail={tr(
                    'Asks everyone again; the recording goes on until they agree, then stops.',
                  )}
                  onPress={() => ask(false)}
                  testID={`${testID}-take`}
                />
              ) : (
                <Mode
                  icon={CircleDot}
                  label={tr('Record too')}
                  detail={tr('Asks everyone again; the notes go on until they agree.')}
                  onPress={() => ask(true)}
                  testID={`${testID}-record`}
                />
              )}
              <Mode
                icon={Square}
                label={tr('Stop Cai')}
                detail={
                  notes.records
                    ? tr('Stops recording and the notes, for everyone, from now.')
                    : tr('Stops the notes, for everyone, from now.')
                }
                onPress={stop}
                testID={`${testID}-stop`}
              />
            </>
          ) : (
            <>
              <Mode
                icon={NotebookPen}
                label={tr('Take notes')}
                detail={tr('What’s said, as words. Voices aren’t kept.')}
                onPress={() => ask(false)}
                testID={`${testID}-take`}
              />
              <Mode
                icon={CircleDot}
                label={tr('Record')}
                detail={tr('The notes, and the voices and any screen shown, kept {days} days.', {
                  days: RECORDING_DAYS,
                })}
                onPress={() => ask(true)}
                testID={`${testID}-record`}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Mode({
  icon: Icon,
  label,
  detail,
  onPress,
  testID,
}: {
  icon: typeof NotebookPen;
  label: string;
  detail: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 10,
        padding: 10,
        borderRadius: 12,
        backgroundColor: pressed ? '#FFFFFF29' : 'transparent',
      })}
    >
      <Icon size={18} color="#FFFFFF" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ color: '#FFFFFF' }}>
          {label}
        </Text>
        <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

/** What the notes are doing, under the call's name: on, or who's still being asked. */
export function NotesLine({ notes, me }: { notes: CallNotesView | null; me: string }) {
  if (notes?.state === 'on') {
    // Another mode asked beside it (M17 I13b2): whoever said yes to it sees who's still asked.
    const sw = notes.switching;
    const switching =
      sw && sw.yes.includes(me) && sw.waitingOn.length
        ? sw.records
          ? tr('Asking {names} to let Cai record too', {
              names: joinNames(sw.waitingOn.map((p) => first(p.displayName))),
            })
          : tr('Asking {names} to let Cai take notes only', {
              names: joinNames(sw.waitingOn.map((p) => first(p.displayName))),
            })
        : null;
    return (
      <View style={{ gap: 2 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          accessibilityRole="text"
          testID="call-notes-on"
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D4F' }} />
          <Text variant="caption" style={{ color: '#FFFFFF', ...OVER_VIDEO }}>
            {notes.records ? tr('Cai is recording') : tr('Cai is taking notes')}
          </Text>
        </View>
        {switching ? (
          <Text
            variant="caption"
            style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
            testID="call-notes-switching"
          >
            {switching}
          </Text>
        ) : null}
      </View>
    );
  }
  if (notes?.state !== 'asking' || !notes.yes.includes(me)) return null;
  return (
    <Text
      variant="caption"
      style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
      testID="call-notes-asking"
    >
      {notes.records
        ? tr('Asking {names} to let Cai record', {
            names: joinNames(notes.waitingOn.map((p) => first(p.displayName))),
          })
        : tr('Asking {names} to let Cai take notes', {
            names: joinNames(notes.waitingOn.map((p) => first(p.displayName))),
          })}
    </Text>
  );
}

/** Asked to let Cai take notes: yes or not now, each said on its button (R85 (1)). */
export function NotesAsk({ notes, me }: { notes: CallNotesView | null; me: string }) {
  // Another mode asked while one is on (M17 I13b2): the same labelled choice, answered to it.
  const sw = notes?.state === 'on' ? notes.switching : null;
  if (sw?.waitingOn.some((p) => p.id === me))
    return (
      <View
        accessibilityRole="alert"
        testID="call-notes-ask"
        style={{
          alignSelf: 'center',
          maxWidth: 380,
          marginHorizontal: 16,
          padding: 16,
          gap: 10,
          borderRadius: 16,
          backgroundColor: '#FFFFFF1F',
        }}
      >
        <Text variant="label" style={{ color: '#FFFFFF' }}>
          {sw.records
            ? tr('{name} asks Cai to record too', { name: first(sw.askedBy.displayName) })
            : tr('{name} asks Cai to take notes only', { name: first(sw.askedBy.displayName) })}
        </Text>
        <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
          {sw.records
            ? tr(
                'From now, Cai would keep what’s said and any screen shown as a recording for everyone in the call for {days} days, beside the notes. Cameras aren’t recorded. Anyone can stop it or delete it.',
                { days: RECORDING_DAYS },
              )
            : tr(
                'The recording would stop here and Cai would go on with the notes alone. Voices aren’t kept from then on.',
              )}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Choice
            label={sw.records ? tr('Let Cai record') : tr('Let Cai take notes')}
            strong
            onPress={() => void answerNotes('yes', sw.id)}
            testID="call-notes-yes"
          />
          <Choice
            label={tr('Not now')}
            onPress={() => void answerNotes('no', sw.id)}
            testID="call-notes-no"
          />
        </View>
      </View>
    );
  if (notes?.state !== 'asking' || !notes.waitingOn.some((p) => p.id === me)) return null;
  return (
    <View
      accessibilityRole="alert"
      testID="call-notes-ask"
      style={{
        alignSelf: 'center',
        maxWidth: 380,
        marginHorizontal: 16,
        padding: 16,
        gap: 10,
        borderRadius: 16,
        backgroundColor: '#FFFFFF1F',
      }}
    >
      <Text variant="label" style={{ color: '#FFFFFF' }}>
        {notes.records
          ? tr('{name} asks Cai to record', { name: first(notes.askedBy.displayName) })
          : tr('{name} asks Cai to take notes', { name: first(notes.askedBy.displayName) })}
      </Text>
      <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
        {notes.records
          ? tr(
              'Cai keeps what’s said and any screen shown as a recording, with notes under each person’s name, for everyone in the call for {days} days. Cameras aren’t recorded. Anyone can stop it or delete it.',
              { days: RECORDING_DAYS },
            )
          : tr(
              'Cai writes down what’s said, under each person’s name, for everyone in the call. Voices aren’t kept, and anyone can stop it.',
            )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Choice
          label={notes.records ? tr('Let Cai record') : tr('Let Cai take notes')}
          strong
          onPress={() => void answerNotes('yes')}
          testID="call-notes-yes"
        />
        <Choice
          label={tr('Not now')}
          onPress={() => void answerNotes('no')}
          testID="call-notes-no"
        />
      </View>
    </View>
  );
}

function Choice({
  label,
  strong = false,
  onPress,
  testID,
}: {
  label: string;
  strong?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: strong ? '#FFFFFF' : '#FFFFFF29',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="label" style={{ color: strong ? INK : '#FFFFFF' }}>
        {label}
      </Text>
    </Pressable>
  );
}
