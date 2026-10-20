/**
 * Cai's notes in a call (M16 F7, R85), as the call screens show them: the line that says they're
 * on (an indicator everyone in the call sees the whole time, R52), the ask to whoever it waits on
 * (a labelled choice, never inferred: R85 (1)), and the control that asks or stops (anyone, any
 * time: R85 (2)).
 */
import type { CallNotesView } from '@caime/core/api';
import { joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import { View } from 'react-native';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { INK, OVER_VIDEO, Round } from './callUi';
import { answerNotes, askNotes, notesAsked, stopNotes } from './notes';

const first = (name: string) => name.split(' ')[0] || name;

/** The control in a call's row: ask Cai to take notes, or stop them. */
export function NotesRound({ notes, testID }: { notes: CallNotesView | null; testID: string }) {
  const live = notesAsked(notes);
  return (
    <Round
      icon={NotebookPen}
      label={
        notes?.state === 'on'
          ? tr('Stop Cai')
          : notes?.state === 'asking'
            ? tr('Stop asking')
            : tr('Take notes')
      }
      on={live}
      onPress={() => void (live ? stopNotes() : askNotes())}
      testID={testID}
    />
  );
}

/** What the notes are doing, under the call's name: on, or who's still being asked. */
export function NotesLine({ notes, me }: { notes: CallNotesView | null; me: string }) {
  if (notes?.state === 'on')
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        accessibilityRole="text"
        testID="call-notes-on"
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D4F' }} />
        <Text variant="caption" style={{ color: '#FFFFFF', ...OVER_VIDEO }}>
          {tr('Cai is taking notes')}
        </Text>
      </View>
    );
  if (notes?.state !== 'asking' || !notes.yes.includes(me)) return null;
  return (
    <Text
      variant="caption"
      style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
      testID="call-notes-asking"
    >
      {tr('Asking {names} to let Cai take notes', {
        names: joinNames(notes.waitingOn.map((p) => first(p.displayName))),
      })}
    </Text>
  );
}

/** Asked to let Cai take notes: yes or not now, each said on its button (R85 (1)). */
export function NotesAsk({ notes, me }: { notes: CallNotesView | null; me: string }) {
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
        {tr('{name} asks Cai to take notes', { name: first(notes.askedBy.displayName) })}
      </Text>
      <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
        {tr(
          'Cai writes down what’s said, under each person’s name, for everyone in the call. Voices aren’t kept, and anyone can stop it.',
        )}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Choice
          label={tr('Let Cai take notes')}
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
