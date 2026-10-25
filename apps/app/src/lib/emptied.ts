/**
 * A text box emptied once what was typed has gone (a message sent, a question asked, a tag
 * added): on a phone the native field is cleared too, since a controlled value alone left the
 * keyboard's own text standing, and a change that arrives into the emptied box within a moment
 * is the keyboard's echo of the words, dropped (iOS commits an autocorrection as the text is
 * replaced and reports the text it corrected). The owner's report of 2026-10-25: a sent message
 * stayed in the composer as if it hadn't gone. `echoesAfterEmpty` is the rule, pure; `useEmptied`
 * binds it to a field.
 */
import { type RefObject, useCallback, useRef } from 'react';
import { Platform, type TextInput } from 'react-native';
import { echoesAfterEmpty } from './emptiedRule';

export function useEmptied(input: RefObject<TextInput | null>) {
  const emptiedAt = useRef(0);
  /** Empties the box: the state through `set`, and on a phone the native field. */
  const empty = useCallback(
    (set: (value: string) => void) => {
      emptiedAt.current = Date.now();
      set('');
      if (Platform.OS !== 'web') input.current?.clear();
    },
    [input],
  );
  /** Whether a change is the keyboard's echo of what just went; the field is cleared again if so. */
  const echoes = useCallback(
    (current: string, next: string): boolean => {
      const echo = echoesAfterEmpty({
        native: Platform.OS !== 'web',
        emptiedAt: emptiedAt.current,
        now: Date.now(),
        current,
        next,
      });
      if (echo) input.current?.clear();
      return echo;
    },
    [input],
  );
  return { empty, echoes };
}
