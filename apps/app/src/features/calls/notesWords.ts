/**
 * What each way into a call says while Cai is asked for or on (R85 (1), R114 (1), (3)): the mode
 * it agrees to, named on the button, so a yes to notes is never taken for a yes to a recording or
 * to Cai joining in. Light (the words alone), since the banner, a meeting's card and a guest's
 * page read it as well as the call screens.
 */
import type { CallNotesView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';

type Mode = Pick<CallNotesView, 'records' | 'interacts'> | null | undefined;

export const answerWithCai = (notes: Mode) =>
  notes?.records && notes.interacts
    ? tr('Answer, Cai records and joins in')
    : notes?.records
      ? tr('Answer, Cai records')
      : notes?.interacts
        ? tr('Answer, Cai joins in')
        : tr('Answer, Cai takes notes');

export const joinWithCai = (notes: Mode) =>
  notes?.records && notes.interacts
    ? tr('Join, Cai records and joins in')
    : notes?.records
      ? tr('Join, Cai records')
      : notes?.interacts
        ? tr('Join, Cai joins in')
        : tr('Join, Cai takes notes');
