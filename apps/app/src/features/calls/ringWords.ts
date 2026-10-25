/**
 * What a ring says of Cai's mode while it's asked for or on (R85 (1), R114): the whole sentence
 * for each mode, so whoever answers knows what they agree to before the button. For the call
 * screens alone (the lighter labels every way in shares are `notesWords.ts`).
 */
import type { CallNotesView } from '@caime/core/api';
import { RECORDING_DAYS } from '@caime/core/calls';
import { tr } from '@caime/core/i18n';

type Mode = Pick<CallNotesView, 'records' | 'interacts'> | null | undefined;

/** A one-to-one ring: what the caller asks of Cai in this call. */
export function ringAsk(notes: Mode, name: string): string {
  if (notes?.records && notes.interacts)
    return tr(
      '{name} asks Cai to record this call and join in: the voices and any screen shown, kept {days} days for everyone in it; it answers aloud when called by name, and everyone hears it.',
      { name, days: RECORDING_DAYS },
    );
  if (notes?.records)
    return tr(
      '{name} asks Cai to record this call: the voices and any screen shown, kept {days} days for everyone in it; anyone in it may share it on.',
      { name, days: RECORDING_DAYS },
    );
  if (notes?.interacts)
    return tr(
      '{name} asks Cai to join in this call: it answers aloud when called by name, from what’s said in it, and everyone hears it.',
      { name },
    );
  return tr('{name} asks Cai to take notes in this call.', { name });
}

/** A group's ring: what Cai does, or is asked to do, in the call that's on. */
export function groupRingLine(notes: (Mode & { state: string }) | null | undefined): string {
  const on = notes?.state === 'on';
  if (notes?.records && notes.interacts)
    return on
      ? tr(
          'Cai is recording this call and joining in: the voices and any screen shown, kept {days} days for everyone in it; it answers aloud when called by name.',
          { days: RECORDING_DAYS },
        )
      : tr(
          'Cai is asked to record this call and join in: the voices and any screen shown, kept {days} days for everyone in it; it answers aloud when called by name.',
          { days: RECORDING_DAYS },
        );
  if (notes?.records)
    return on
      ? tr(
          'Cai is recording this call: the voices and any screen shown, kept {days} days for everyone in it; anyone in it may share it on.',
          { days: RECORDING_DAYS },
        )
      : tr(
          'Cai is asked to record this call: the voices and any screen shown, kept {days} days for everyone in it; anyone in it may share it on.',
          { days: RECORDING_DAYS },
        );
  if (notes?.interacts)
    return on
      ? tr(
          'Cai is joining in this call: it answers aloud when called by name, from what’s said in it.',
        )
      : tr(
          'Cai is asked to join in this call: it answers aloud when called by name, from what’s said in it.',
        );
  return on
    ? tr('Cai is taking notes in this call.')
    : tr('Cai is asked to take notes in this call.');
}
