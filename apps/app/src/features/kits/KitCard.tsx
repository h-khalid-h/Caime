import type { MessageView } from '@caishy/core/api';
import { formatDue } from '@caishy/core/format';
import {
  isCardKit,
  kitDetails,
  kitMoves,
  kitStateLabel,
  kitStateTone,
} from '@caishy/core/kit-cards';
import { KITS } from '@caishy/core/kits';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ListChecks } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { KIT_ICONS } from './icons';

interface CardPayload {
  kit?: unknown;
  label?: string;
  title?: string;
  state?: string;
  fields?: Record<string, unknown>;
  dueAt?: string | null;
}

const TONE = { positive: 'success', negative: 'danger', neutral: 'neutral' } as const;

function StateChip({ state }: { state: string }) {
  return <Chip label={kitStateLabel(state)} tone={TONE[kitStateTone(state)]} size="sm" />;
}

/**
 * A Connect Kit card in a conversation: what it is, where it stands, and the moves this person
 * can make on it (core kit-cards.ts). The server's request cards (a task asked of someone) read
 * the same way, and change from Actions.
 */
export function KitCard({ m, mine }: { m: MessageView; mine: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState<string | null>(null);
  const p = (m.payload ?? {}) as CardPayload;
  const state = p.state ?? '';

  if (!isCardKit(p.kit)) {
    return (
      <View style={{ gap: 6, minWidth: 220 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ListChecks size={16} color={t.c.accentStrong} />
          <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
            Request
          </Text>
          {state ? <StateChip state={state} /> : null}
        </View>
        <Text variant="bodyStrong">{p.title ?? 'Request'}</Text>
        {p.dueAt ? (
          <Text variant="caption" color="textSecondary">
            Due {formatDue(p.dueAt, now, timeZone, locale)}
          </Text>
        ) : null}
      </View>
    );
  }

  const kit = p.kit;
  const Icon = KIT_ICONS[kit];
  const details = kitDetails(kit, p.fields ?? {}, { now, timeZone, locale });
  const moves = m.deletedAt ? [] : kitMoves(kit, state, mine);
  const go = async (to: string) => {
    setBusy(to);
    try {
      const res = await endpoints.moveKit(m.id, to);
      upsertMessage(qc, res.message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID={`kit-${kit}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {p.label ?? KITS[kit].name}
        </Text>
        <StateChip state={state} />
      </View>
      <Text variant="bodyStrong">{p.title}</Text>
      {details.length ? (
        <View style={{ gap: 3 }}>
          {details.map((d) => (
            <View key={d.label} style={{ flexDirection: 'row', gap: 10 }}>
              <Text variant="caption" color="textTertiary" style={{ width: 76 }}>
                {d.label}
              </Text>
              <Text variant="caption" style={{ flex: 1 }}>
                {d.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {moves.length ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
          {moves.map((move, i) => (
            <Button
              key={move.to}
              label={move.label}
              size="sm"
              variant={i === 0 ? 'primary' : 'secondary'}
              loading={busy === move.to}
              disabled={busy !== null}
              onPress={() => void go(move.to)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
