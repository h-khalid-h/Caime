/**
 * What a tap on a day, a number or an address in a message offers (M17 I9d): a day ahead as a
 * Meeting card at that moment (`onMeeting`, the screen's, where a meeting may be proposed here);
 * a number to call; an address to write to; each to copy. Nothing is done but what's chosen, and a
 * card is sent only from its form. Loaded on the first tap, by the conversation screen alone, so
 * it imports nothing of the conversation's own chunk.
 */
import { formatWhenAt } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import type { Tappable } from '@caime/core/tappable';
import CalendarPlus from 'lucide-react-native/icons/calendar-plus';
import Copy from 'lucide-react-native/icons/copy';
import Mail from 'lucide-react-native/icons/mail';
import Phone from 'lucide-react-native/icons/phone';
import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { openLink } from '@/lib/links';
import { useUserClock } from '@/lib/time';
import { ListRow } from '@/ui/ListRow';
import { afterSheet, Sheet } from '@/ui/Sheet';
import { toast } from '@/ui/Toast';

/** A phone number as a call is placed to it: its digits, and a leading plus. */
function dialable(number: string): string {
  const digits = number.replace(/[^\d+]/g, '');
  return digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
}

export function TappedSheet({
  tap,
  onMeeting,
  onClose,
}: {
  tap: Tappable | null;
  onMeeting?: () => void;
  onClose: () => void;
}) {
  const { timeZone, locale } = useUserClock();
  // What was tapped stays while the sheet leaves, so it doesn't fade out empty.
  const [last, setLast] = useState(tap);
  useEffect(() => {
    if (tap) setLast(tap);
  }, [tap]);
  const shownTap = tap ?? last;
  const shown = !shownTap
    ? ''
    : shownTap.kind === 'date'
      ? formatWhenAt(shownTap.at, shownTap.hasTime, new Date(), timeZone, locale)
      : shownTap.kind === 'phone'
        ? shownTap.number
        : shownTap.address;
  const copy = () => {
    onClose();
    void copyText(shown).then(() => toast(tr('Copied')));
  };
  return (
    <Sheet open={Boolean(tap)} onClose={onClose} title={shown}>
      {shownTap?.kind === 'date' && onMeeting ? (
        <ListRow
          icon={CalendarPlus}
          title={tr('Make it a Meeting card')}
          onPress={() => {
            onClose();
            afterSheet(onMeeting);
          }}
          testID="tapped-meeting"
        />
      ) : null}
      {shownTap?.kind === 'phone' ? (
        <ListRow
          icon={Phone}
          title={tr('Call this number')}
          onPress={() => {
            onClose();
            openLink(`tel:${dialable(shownTap.number)}`);
          }}
          testID="tapped-call"
        />
      ) : null}
      {shownTap?.kind === 'email' ? (
        <ListRow
          icon={Mail}
          title={tr('Write to this address')}
          onPress={() => {
            onClose();
            openLink(`mailto:${shownTap.address}`);
          }}
          testID="tapped-email"
        />
      ) : null}
      {shownTap ? (
        <ListRow icon={Copy} title={tr('Copy')} onPress={copy} testID="tapped-copy" />
      ) : null}
    </Sheet>
  );
}
