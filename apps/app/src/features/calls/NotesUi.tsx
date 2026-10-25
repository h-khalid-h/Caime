/**
 * Cai's notes in a call (M16 F7, R85), its recording (R114, M17 I13b) and Cai joining in (R114
 * (3), M17 I13g), as the call screens show them: the line that says what Cai is doing (an
 * indicator everyone in the call sees the whole time, R52; "Cai is speaking" while it does), the
 * ask to whoever it waits on (a labelled choice, never inferred: R85 (1)), what Cai wrote to this
 * person alone, and the controls that ask for a mode, or stop (anyone, any time: R85 (2)).
 */
import type { CallNotesSwitchView, CallNotesView } from '@caime/core/api';
import { notesAsked, RECORDING_DAYS } from '@caime/core/calls';
import { joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { CAI_ID } from '@caime/core/system-ids';
import AudioLines from 'lucide-react-native/icons/audio-lines';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import MessageCircleQuestion from 'lucide-react-native/icons/message-circle-question-mark';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Square from 'lucide-react-native/icons/square';
import { useState } from 'react';
import { View } from 'react-native';
import { openDirectWith } from '@/features/inbox/openChat';
import { useSession } from '@/state/session';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { INK, OVER_VIDEO, Round } from './callUi';
import { answerNotes, askNotes, stopNotes } from './notes';
import { dismissWritten, useCaiVoice } from './voice';

const first = (name: string) => name.split(' ')[0] || name;

const AskCai = lazyPart(() => import('./AskCai').then((m) => m.AskCai));

type Mode = Pick<CallNotesView, 'records' | 'interacts'>;

/** The icon of a mode: joining in over recording over notes. */
const iconOf = (mode: Mode | null | undefined) =>
  mode?.interacts ? AudioLines : mode?.records ? CircleDot : NotebookPen;

/**
 * What a switch asks, against the mode under way (M17 I13b2): one thing changes at a time, since
 * the round offers one at a time.
 */
function switchKind(
  notes: Mode,
  sw: Pick<CallNotesSwitchView, 'records' | 'interacts'>,
): 'record' | 'notes' | 'join' | 'unjoin' {
  if (sw.interacts !== notes.interacts) return sw.interacts ? 'join' : 'unjoin';
  return sw.records ? 'record' : 'notes';
}

/**
 * The control in a call's row: Cai, which offers Take notes, Record (R114 (1)) or Join in (R114
 * (3)), each saying what it keeps or does, so whoever asks chooses knowing; while one is asked
 * for (or another mode asked beside it, M17 I13b2) it withdraws the ask; while one is on it offers
 * the others (asked of everyone again, the one under way going on until they have) and Stop. One
 * round, so the row fits a phone.
 */
export function NotesRound({
  callId,
  notes,
  testID,
}: {
  callId: string;
  notes: CallNotesView | null;
  testID: string;
}) {
  const [choosing, setChoosing] = useState(false);
  // A question typed to Cai about the call (M17 I13f), for whoever may use AI assist.
  const [asking, setAsking] = useState(false);
  const assisted = useSession((s) => Boolean(s.user?.aiEnabled && !s.user.minor));
  if (notes?.state === 'asking' || notes?.switching)
    return (
      <Round
        icon={iconOf(notes.switching ?? notes)}
        label={tr('Stop asking')}
        on
        onPress={() => void stopNotes()}
        testID={testID}
      />
    );
  const on = notesAsked(notes);
  const ask = (mode: Mode) => {
    setChoosing(false);
    void askNotes(mode);
  };
  const stop = () => {
    setChoosing(false);
    void stopNotes();
  };
  return (
    <View>
      <Round
        icon={on ? iconOf(notes) : NotebookPen}
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
                  onPress={() => ask({ records: false, interacts: notes.interacts })}
                  testID={`${testID}-take`}
                />
              ) : (
                <Mode
                  icon={CircleDot}
                  label={tr('Record too')}
                  detail={tr('Asks everyone again; the notes go on until they agree.')}
                  onPress={() => ask({ records: true, interacts: notes.interacts })}
                  testID={`${testID}-record`}
                />
              )}
              {notes.interacts ? (
                <Mode
                  icon={AudioLines}
                  label={tr('Stop joining in')}
                  detail={tr('Asks everyone again; Cai answers aloud until they agree.')}
                  onPress={() => ask({ records: notes.records, interacts: false })}
                  testID={`${testID}-unjoin`}
                />
              ) : (
                <Mode
                  icon={AudioLines}
                  label={tr('Join in too')}
                  detail={tr(
                    'Asks everyone again; Cai answers aloud when called by name from then on.',
                  )}
                  onPress={() => ask({ records: notes.records, interacts: true })}
                  testID={`${testID}-join`}
                />
              )}
              {assisted ? (
                <Mode
                  icon={MessageCircleQuestion}
                  label={tr('Ask Cai')}
                  detail={tr('A question about the call, answered to you alone from the notes.')}
                  onPress={() => {
                    setChoosing(false);
                    setAsking(true);
                  }}
                  testID={`${testID}-ask`}
                />
              ) : null}
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
                onPress={() => ask({ records: false, interacts: false })}
                testID={`${testID}-take`}
              />
              <Mode
                icon={CircleDot}
                label={tr('Record')}
                detail={tr(
                  'The notes, and the voices and any screen shown, kept {days} days; anyone in the call may share it on.',
                  {
                    days: RECORDING_DAYS,
                  },
                )}
                onPress={() => ask({ records: true, interacts: false })}
                testID={`${testID}-record`}
              />
              <Mode
                icon={AudioLines}
                label={tr('Join in')}
                detail={tr(
                  'Cai answers aloud when someone calls it by name, from what’s said in the call. Everyone hears it; nothing of anyone’s own things is said.',
                )}
                onPress={() => ask({ records: false, interacts: true })}
                testID={`${testID}-join`}
              />
            </>
          )}
        </View>
      ) : null}
      {asking ? (
        <AskCai callId={callId} open={asking} onClose={() => setAsking(false)} play={null} />
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

/** What Cai is doing, in words everyone in the call reads the same. */
const onLine = (mode: Mode) =>
  mode.records && mode.interacts
    ? tr('Cai is recording and joining in')
    : mode.records
      ? tr('Cai is recording')
      : mode.interacts
        ? tr('Cai is joining in')
        : tr('Cai is taking notes');

/** What the notes are doing, under the call's name: on, or who's still being asked. */
export function NotesLine({ notes, me }: { notes: CallNotesView | null; me: string }) {
  const speaking = useCaiVoice((s) => s.speaking);
  if (notes?.state === 'on') {
    // Another mode asked beside it (M17 I13b2): whoever said yes to it sees who's still asked.
    const sw = notes.switching;
    const names = sw ? joinNames(sw.waitingOn.map((p) => first(p.displayName))) : '';
    const switching =
      sw?.yes.includes(me) && sw.waitingOn.length
        ? {
            record: tr('Asking {names} to let Cai record too', { names }),
            notes: tr('Asking {names} to let Cai take notes only', { names }),
            join: tr('Asking {names} to let Cai join in too', { names }),
            unjoin: tr('Asking {names} to go on without Cai joining in', { names }),
          }[switchKind(notes, sw)]
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
            {onLine(notes)}
          </Text>
        </View>
        {notes.interacts && speaking ? (
          // Cai speaking (M17 I13g): everyone in the call sees it while they hear it.
          <Text
            variant="caption"
            accessibilityLiveRegion="polite"
            style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
            testID="call-cai-speaking"
          >
            {tr('Cai is speaking')}
          </Text>
        ) : null}
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
  const names = joinNames(notes.waitingOn.map((p) => first(p.displayName)));
  return (
    <Text
      variant="caption"
      style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
      testID="call-notes-asking"
    >
      {notes.records && notes.interacts
        ? tr('Asking {names} to let Cai record and join in', { names })
        : notes.records
          ? tr('Asking {names} to let Cai record', { names })
          : notes.interacts
            ? tr('Asking {names} to let Cai join in', { names })
            : tr('Asking {names} to let Cai take notes', { names })}
    </Text>
  );
}

/** Asked to let Cai take notes: yes or not now, each said on its button (R85 (1)). */
export function NotesAsk({ notes, me }: { notes: CallNotesView | null; me: string }) {
  // Another mode asked while one is on (M17 I13b2): the same labelled choice, answered to it.
  const sw = notes?.state === 'on' ? notes.switching : null;
  if (notes && sw?.waitingOn.some((p) => p.id === me)) {
    const kind = switchKind(notes, sw);
    const name = first(sw.askedBy.displayName);
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
          {
            {
              record: tr('{name} asks Cai to record too', { name }),
              notes: tr('{name} asks Cai to take notes only', { name }),
              join: tr('{name} asks Cai to join in too', { name }),
              unjoin: tr('{name} asks to go on without Cai joining in', { name }),
            }[kind]
          }
        </Text>
        <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
          {
            {
              record: tr(
                'From now, Cai would keep what’s said and any screen shown as a recording for everyone in the call for {days} days, beside the notes. Cameras aren’t recorded. Anyone can stop it, delete it or share it on.',
                { days: RECORDING_DAYS },
              ),
              notes: tr(
                'The recording would stop here and Cai would go on with the notes alone. Voices aren’t kept from then on.',
              ),
              join: tr(
                'From now, Cai would also answer aloud when someone calls it by name, from what’s said in the call: everyone hears it, and it never says anyone’s own calendar or messages.',
              ),
              unjoin: tr('From now, Cai would stop answering aloud and go on as before.'),
            }[kind]
          }
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Choice
            label={
              {
                record: tr('Let Cai record'),
                notes: tr('Let Cai take notes'),
                join: tr('Let Cai join in'),
                unjoin: tr('Go on without Cai joining in'),
              }[kind]
            }
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
  }
  if (notes?.state !== 'asking' || !notes.waitingOn.some((p) => p.id === me)) return null;
  const name = first(notes.askedBy.displayName);
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
        {notes.records && notes.interacts
          ? tr('{name} asks Cai to record and join in', { name })
          : notes.records
            ? tr('{name} asks Cai to record', { name })
            : notes.interacts
              ? tr('{name} asks Cai to join in', { name })
              : tr('{name} asks Cai to take notes', { name })}
      </Text>
      <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
        {notes.records && notes.interacts
          ? tr(
              'Cai keeps what’s said and any screen shown as a recording, with notes under each person’s name, for everyone in the call for {days} days, and answers aloud when someone calls it by name: everyone hears it. Cameras aren’t recorded. Anyone can stop it, delete it or share it on.',
              { days: RECORDING_DAYS },
            )
          : notes.records
            ? tr(
                'Cai keeps what’s said and any screen shown as a recording, with notes under each person’s name, for everyone in the call for {days} days. Cameras aren’t recorded. Anyone can stop it, delete it or share it on.',
                { days: RECORDING_DAYS },
              )
            : notes.interacts
              ? tr(
                  'Cai writes down what’s said, under each person’s name, for everyone in the call, and answers aloud when someone calls it by name, from what’s said in it: everyone hears it, and it never says anyone’s own calendar or messages. Voices aren’t kept, and anyone can stop it.',
                )
              : tr(
                  'Cai writes down what’s said, under each person’s name, for everyone in the call. Voices aren’t kept, and anyone can stop it.',
                )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Choice
          label={
            notes.records && notes.interacts
              ? tr('Let Cai record and join in')
              : notes.records
                ? tr('Let Cai record')
                : notes.interacts
                  ? tr('Let Cai join in')
                  : tr('Let Cai take notes')
          }
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

/**
 * What Cai wrote to this person alone in the call (M17 I13g): their own things, something it
 * kept or prepared in their chat with it; shown until they've read it, never said aloud.
 */
export function CaiWritten({ callId }: { callId: string }) {
  const written = useCaiVoice((s) => s.written);
  if (!written || written.callId !== callId) return null;
  return (
    <View
      accessibilityRole="alert"
      testID="call-cai-written"
      style={{
        alignSelf: 'center',
        maxWidth: 380,
        marginHorizontal: 16,
        marginTop: 8,
        padding: 16,
        gap: 10,
        borderRadius: 16,
        backgroundColor: '#FFFFFF1F',
      }}
    >
      <Text variant="label" style={{ color: '#FFFFFF' }}>
        {tr('Cai wrote to you')}
      </Text>
      <Text variant="caption" style={{ color: '#FFFFFFDD' }} testID="call-cai-written-text">
        {written.text}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {written.open === 'cai' ? (
          <Choice
            label={tr('Open Cai’s chat')}
            strong
            onPress={() => {
              dismissWritten();
              void openDirectWith(CAI_ID);
            }}
            testID="call-cai-written-open"
          />
        ) : null}
        <Choice label={tr('OK')} onPress={dismissWritten} testID="call-cai-written-ok" />
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
