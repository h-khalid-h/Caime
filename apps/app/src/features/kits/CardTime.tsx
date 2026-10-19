/**
 * Another time for a meeting or an appointment (M16 F5): either side suggests one from the card,
 * which then asks the other where it stands; whoever has it by mail or as a guest is sent the
 * update by the server. Offered only where core `retimeBlock` lets the card move (one time, not
 * someone's calendar invitation, not moved to its own space, not booked from a catalog).
 */

import type { MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { retimeBlock } from '@caime/core/kit-cards';
import { standsAside } from '@caime/core/payments';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { toast } from '@/ui/Toast';

// Loaded when it's opened, as everywhere else: the cards are drawn by several routes, so a
// static import put the sheet in the first download.
const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));

export function CardTime({
  m,
  card,
}: {
  m: MessageView;
  card: Parameters<typeof retimeBlock>[0] & Parameters<typeof standsAside>[0];
}) {
  const qc = useQueryClient();
  const { timeZone } = useUserClock();
  const meId = useSession((s) => s.user?.id ?? '');
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (m.deletedAt || retimeBlock(card) || standsAside(card, meId, m.senderId)) return null;
  const suggest = async (chosen: Chosen) => {
    setBusy(true);
    try {
      const res = await endpoints.retimeCard(m.id, {
        start: { at: instantOf(chosen, timeZone).toISOString(), hasTime: true },
      });
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
      {choosing ? (
        <WhenSheet
          open
          onClose={() => setChoosing(false)}
          title={tr('Suggest another time')}
          value={null}
          time="required"
          future
          onChange={(chosen) => void suggest(chosen)}
          testID="kit-another-time-sheet"
        />
      ) : null}
    </View>
  );
}
