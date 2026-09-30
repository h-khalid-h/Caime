import type { ConversationView, MessageView } from '@caime/core/api';
import { formatAmount } from '@caime/core/format';
import {
  applySplitOp,
  type KitAmount,
  type SplitOp,
  splitShares,
  splitState,
} from '@caime/core/kit-cards';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Chip } from '@/ui/Chip';
import { HandCoins, Square, SquareCheck } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

interface SplitPayload {
  label?: string;
  title?: string;
  state?: string;
  fields?: Record<string, unknown>;
}

/**
 * A split (R38): who owes whom for something one person paid, an equal share each. The person
 * who owes a share, or whoever paid, marks it settled between them; Caime moves nothing. A mark
 * shows at once, by the same rule the server applies (core kit-cards.ts), and the server's card
 * replaces it when it answers.
 */
export function SplitCard({ m, mine }: { m: MessageView; mine: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const { locale } = useUserClock();
  // Names come with the conversation, which is loaded before any of its cards: never fetched here.
  const people = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) =>
      new Map(d.conversation.participants.map((p) => [p.userId, p.person.displayName])),
  }).data;
  const p = (m.payload ?? {}) as SplitPayload;
  const shares = splitShares(p.fields ?? {});
  const total = p.fields?.amount as KitAmount | undefined;
  const currency = total?.currency ?? null;
  const settled = shares.filter((s) => s.settledAt).length;
  const open = !m.deletedAt;
  const nameOf = (id: string) => (id === me.id ? 'You' : (people?.get(id) ?? 'Someone'));

  const change = async (op: SplitOp) => {
    const local = applySplitOp(shares, op, {
      userId: me.id,
      isCreator: mine,
      at: new Date().toISOString(),
    });
    if (!local.ok) return toast(local.error, { tone: 'danger' });
    upsertMessage(qc, {
      ...m,
      payload: {
        ...p,
        fields: { ...p.fields, shares: local.shares },
        state: splitState(local.shares),
      },
    });
    try {
      upsertMessage(qc, (await endpoints.split(m.id, op)).message);
    } catch (e) {
      upsertMessage(qc, m);
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID="kit-split">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <HandCoins size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {p.label ?? 'Split'}
        </Text>
        <Chip
          label={
            shares.length && settled === shares.length
              ? 'Settled'
              : `${settled} of ${shares.length} settled`
          }
          tone={shares.length && settled === shares.length ? 'success' : 'neutral'}
          size="sm"
        />
      </View>
      <Text variant="bodyStrong">{p.title}</Text>
      {total ? (
        <Text variant="caption" color="textSecondary">
          {formatAmount(total.value, currency, locale)} paid by {nameOf(m.senderId ?? '')}
        </Text>
      ) : null}
      <View accessibilityRole="list">
        {shares.map((share) => {
          const done = Boolean(share.settledAt);
          const Box = done ? SquareCheck : Square;
          const may = open && (mine || share.userId === me.id);
          const label = `${nameOf(share.userId)} · ${formatAmount(share.amount, currency, locale)}`;
          return (
            <Pressable
              key={share.userId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done, disabled: !may }}
              accessibilityLabel={label}
              disabled={!may}
              onPress={() =>
                void change({ op: done ? 'unsettle' : 'settle', userId: share.userId })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 6,
                minHeight: 36,
              }}
              testID={`split-share-${share.userId}`}
            >
              <Box size={20} color={done ? t.c.success : t.c.textTertiary} />
              <Text variant="body" color={done ? 'textTertiary' : 'text'} style={{ flex: 1 }} auto>
                {nameOf(share.userId)}
              </Text>
              <Text variant="body" color={done ? 'textTertiary' : 'text'}>
                {formatAmount(share.amount, currency, locale)}
              </Text>
              <Text variant="caption" color="textTertiary">
                {done ? 'Settled' : may ? 'Mark settled' : 'Owed'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
