/**
 * What the app says when a check of one's age comes back (M16 B7), and the account read again
 * so every screen follows what it found.
 */
import type { AgeReturnState } from '@caime/core/age-assurance';
import { tr } from '@caime/core/i18n';
import { useSession } from '@/state/session';
import { toast } from '@/ui/Toast';

export function sayAgeReturn(state: AgeReturnState): void {
  if (state === 'adult') toast(tr('Checked: you’re 18 or over.'), { tone: 'success' });
  else if (state === 'minor') toast(tr('The check found you’re under 18.'));
  else if (state === 'failed') toast(tr('The check didn’t give an answer. You can try again.'));
  else if (state === 'waiting') toast(tr('Your check is on its way. It shows here in a moment.'));
  void useSession.getState().refresh();
}
