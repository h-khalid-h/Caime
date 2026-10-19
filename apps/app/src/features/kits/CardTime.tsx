/**
 * Another time for a meeting or an appointment (M16 F5): either side suggests one from the card,
 * which then asks the other where it stands; whoever has it by mail or as a guest is sent the
 * update by the server. Offered only where core `retimeBlock` lets the card move (one time, not
 * someone's calendar invitation, not moved to its own space). A booking from the catalog (M16
 * F5b) offers the open times of what it booked instead of any time; one booked from a page by
 * someone reached only by mail offers nothing, as the server refuses it.
 */

import type { ConversationView, MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { retimeBlock } from '@caime/core/kit-cards';
import { standsAside } from '@caime/core/payments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { type BookingHostRef, endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { mailBound, reachedByMail } from '@/features/conversation/topics';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { toast } from '@/ui/Toast';
import { RebookSheet } from './RebookSheet';

// Loaded when it's opened, as everywhere else: the cards are drawn by several routes, so a
// static import put the sheet in the first download. The booking's sheet comes with the card:
// it shares the slot picker with the card's form, and apart it took the picker there (1.0 KB).
const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));

interface Booked {
  itemId?: string;
  quantity?: number;
  hostId?: string;
}

export function CardTime({
  m,
  card,
}: {
  m: MessageView;
  card: Parameters<typeof retimeBlock>[0] &
    Parameters<typeof standsAside>[0] & {
      booking?: Booked | null;
      fields?: { start?: { at?: string } } | null;
    };
}) {
  const qc = useQueryClient();
  const { timeZone } = useUserClock();
  const meId = useSession((s) => s.user?.id ?? '');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Whose catalog a booking is from, and whether it was booked from a page by someone who reads
  // only mail: from the conversation as it loaded, never fetched from here.
  const here = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) => {
      const c = d.conversation;
      const customer =
        c.business?.thread?.customer?.id ?? (mailBound(c) ? (c.other?.person.id ?? null) : null);
      return {
        orgId: c.business?.org.id ?? null,
        byPage: reachedByMail(c) && m.senderId === customer,
      };
    },
  }).data;
  const booking = card.booking ?? null;
  const host: BookingHostRef | null = booking
    ? here?.orgId
      ? { kind: 'org', id: here.orgId }
      : booking.hostId
        ? { kind: 'person', id: booking.hostId }
        : null
    : null;
  if (m.deletedAt || retimeBlock(card) || standsAside(card, meId, m.senderId)) return null;
  if (booking && (here?.byPage || !host || !booking.itemId)) return null;
  const suggest = async (at: string) => {
    setBusy(true);
    try {
      const res = await endpoints.retimeCard(m.id, { start: { at, hasTime: true } });
      upsertMessage(qc, res.message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flexDirection: 'row' }}>
      <Button
        label={tr('Suggest another time')}
        size="sm"
        variant="secondary"
        loading={busy}
        onPress={() => setChoosing(true)}
        testID="kit-another-time"
      />
      {choosing && host && booking?.itemId ? (
        <RebookSheet
          open
          onClose={() => setChoosing(false)}
          host={host}
          itemId={booking.itemId}
          quantity={booking.quantity ?? 1}
          messageId={m.id}
          current={card.fields?.start?.at ?? null}
          onChoose={(at) => void suggest(at)}
        />
      ) : choosing ? (
        <WhenSheet
          open
          onClose={() => setChoosing(false)}
          title={tr('Suggest another time')}
          value={null}
          time="required"
          future
          onChange={(chosen: Chosen) => void suggest(instantOf(chosen, timeZone).toISOString())}
          testID="kit-another-time-sheet"
        />
      ) : null}
    </View>
  );
}
