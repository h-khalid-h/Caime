/**
 * Cai answering for someone (R116, M17 I16a), as the person who wrote to them meets it: above the
 * composer, while Cai offers its two choices, "Leave my message" (the request as it always was)
 * and "Talk to Cai now" (from their own AI allowance, which it says); then, while they talk, that
 * it's Cai they're writing to. Loaded only in a conversation where Cai answers.
 */
import type { CaiAnsweringView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function CaiAnswering({
  conversationId,
  answering,
  name,
}: {
  conversationId: string;
  answering: CaiAnsweringView;
  /** Whom Cai answers for. */
  name: string;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'leave' | 'talk' | null>(null);
  if (answering.side !== 'caller') return null;
  if (answering.state !== 'offered' && answering.state !== 'talking') return null;
  const choose = async (choice: 'leave' | 'talk') => {
    setBusy(choice);
    try {
      await endpoints.chooseCaiAnswer(conversationId, choice);
      await qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 12,
        gap: 10,
        borderRadius: t.radii.md,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID="cai-answering"
    >
      <Text variant="caption" color="textSecondary">
        {answering.state === 'talking'
          ? tr('You’re writing to Cai, who answers for {name} and passes on what you need.', {
              name,
            })
          : answering.talk
            ? tr(
                'Cai answers for {name}. Leave your message for them, or talk to Cai now: that uses your own AI allowance.',
                { name },
              )
            : tr('Cai answers for {name}. Your message waits for them.', { name })}
      </Text>
      {answering.state === 'offered' ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            label={tr('Leave my message')}
            size="sm"
            variant="secondary"
            loading={busy === 'leave'}
            disabled={busy !== null}
            onPress={() => void choose('leave')}
            testID="cai-answering-leave"
          />
          {answering.talk ? (
            <Button
              label={tr('Talk to Cai now')}
              size="sm"
              loading={busy === 'talk'}
              disabled={busy !== null}
              onPress={() => void choose('talk')}
              testID="cai-answering-talk"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
