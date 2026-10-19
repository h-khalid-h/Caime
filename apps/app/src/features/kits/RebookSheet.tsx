/**
 * Another open time for a booking from the catalog (M16 F5b): what it booked, at the times its
 * catalog has open, the time it has now freed for it (`except`), chosen as in the card's form;
 * the server checks the time again as a booking is checked. It comes with the card, in the
 * conversation's chunk beside the card's form, whose slot picker it shares.
 */

import { tr } from '@caime/core/i18n';
import { useMemo, useState } from 'react';
import type { BookingHostRef } from '@/api/endpoints';
import { useSlots } from '@/api/hooks';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { SlotPicker, SlotPickerHolder } from './SlotPicker';

/** How far ahead its open times are offered, as the card's form offers them. */
const AHEAD_DAYS = 60;

export function RebookSheet({
  open,
  onClose,
  host,
  itemId,
  quantity,
  messageId,
  current,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  host: BookingHostRef;
  itemId: string;
  quantity: number;
  messageId: string;
  /** The time it has now, which isn't another. */
  current: string | null;
  onChoose: (at: string) => void;
}) {
  const { timeZone, locale } = useUserClock();
  const window = useMemo(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + AHEAD_DAYS * 86_400_000).toISOString(),
    };
  }, []);
  const slots = useSlots(host, window.from, window.to, itemId, quantity, messageId);
  const [slot, setSlot] = useState<string | null>(null);
  const now = current ? new Date(current).getTime() : null;
  const offered = (slots.data?.slots ?? []).filter((s) => new Date(s).getTime() !== now);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Suggest another time')}
      footer={
        <Button
          label={tr('Done')}
          size="lg"
          block
          disabled={!slot}
          onPress={() => {
            if (!slot) return;
            onChoose(slot);
            onClose();
          }}
          testID="kit-another-slot-done"
        />
      }
    >
      {offered.length ? (
        <SlotPicker
          slots={offered}
          slotMinutes={slots.data?.slotMinutes ?? 0}
          value={slot}
          onChange={setSlot}
          timeZone={timeZone}
          locale={locale}
        />
      ) : slots.isLoading ? (
        <SlotPickerHolder label={tr('When')} />
      ) : (
        <Text color="textSecondary">{tr('No other open times in the next two months.')}</Text>
      )}
    </Sheet>
  );
}
