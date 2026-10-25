/**
 * What each way into a call says while Cai is asked for or on (R85 (1), R114 (1)): the mode it
 * agrees to, named on the button, so a yes to notes is never taken for a yes to a recording.
 * Light (the words alone), since the banner, a meeting's card and a guest's page read it as well
 * as the call screens.
 */
import type { CallNotesView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';

type Mode = Pick<CallNotesView, 'records'> | null | undefined;

export const answerWithCai = (notes: Mode) =>
  notes?.records ? tr('Answer, Cai records') : tr('Answer, Cai takes notes');

export const joinWithCai = (notes: Mode) =>
  notes?.records ? tr('Join, Cai records') : tr('Join, Cai takes notes');
