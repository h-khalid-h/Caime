import type { MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { upsertMessage } from '@/state/cache';
import { Check } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

interface PollPayload {
  question: string;
  options: Array<{ id: string; text: string }>;
  multiple?: boolean;
}

export function PollBody({
  m,
  fg,
  meta,
  mine,
}: {
  m: MessageView;
  fg: string;
  meta: string;
  mine: boolean;
}) {
  const qc = useQueryClient();
  const p = m.payload as unknown as PollPayload;
  const poll = m.poll ?? { counts: {}, mine: [], voters: 0 };
  const total = Object.values(poll.counts).reduce((a, b) => a + b, 0);
  const vote = async (optionId: string) => {
    const selected = new Set(poll.mine);
    if (selected.has(optionId)) selected.delete(optionId);
    else {
      if (!p.multiple) selected.clear();
      selected.add(optionId);
    }
    try {
      const res = await endpoints.vote(m.id, [...selected]);
      upsertMessage(qc, res.message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <View style={{ gap: 8, minWidth: 220 }}>
      <Text variant="label" color={fg}>
        {p.question}
      </Text>
      {p.options.map((o) => {
        const count = poll.counts[o.id] ?? 0;
        const share = total ? count / total : 0;
        const chosen = poll.mine.includes(o.id);
        return (
          <Pressable
            key={o.id}
            accessibilityRole={p.multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={tr('{text}, {count} vote{value}', {
              text: o.text,
              count,
              value: count === 1 ? '' : 's',
            })}
            onPress={() => void vote(o.id)}
            style={{
              borderRadius: 10,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: mine ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.08)',
            }}
          >
            <View
              style={{
                position: 'absolute',
                start: 0,
                top: 0,
                bottom: 0,
                width: `${Math.round(share * 100)}%`,
                backgroundColor: mine ? 'rgba(255,255,255,0.22)' : 'rgba(91,64,160,0.12)',
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              {chosen ? <Check size={14} color={fg} /> : null}
              <Text variant="body" color={fg} style={{ flex: 1 }}>
                {o.text}
              </Text>
              <Text variant="captionStrong" color={meta}>
                {count}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text variant="caption" color={meta}>
        {poll.voters} {poll.voters === 1 ? 'person' : 'people'} voted
        {p.multiple ? tr(' · pick any') : ''}
      </Text>
    </View>
  );
}
