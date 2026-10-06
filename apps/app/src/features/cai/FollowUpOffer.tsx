import { firstName } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** What Cai's follow-up offer carries (R68): where it goes, to whom, and the words. */
export interface FollowUpPayload {
  taskId: string;
  conversationId: string;
  to: string;
  draft: string;
  sentAt?: string;
}

/**
 * Under Cai's offer of a follow-up (R68): send it as yours, or open the conversation with it in
 * the composer to change first. Nothing goes until one of them is pressed.
 */
export function FollowUpOffer({ messageId, offer }: { messageId: string; offer: FollowUpPayload }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(Boolean(offer.sentAt));
  const name = firstName(offer.to);
  if (sent)
    return (
      <Text
        variant="caption"
        color="textSecondary"
        style={{ marginStart: 12, marginTop: 4 }}
        testID="follow-up-sent"
      >
        {tr('Sent to {name}', { name })}
      </Text>
    );
  const send = async () => {
    setBusy(true);
    try {
      await endpoints.sendFollowUp(messageId);
      setSent(true);
      void qc.invalidateQueries({ queryKey: qk.attentionHome });
      void qc.invalidateQueries({ queryKey: qk.cai });
      toast(tr('Sent to {name}', { name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginStart: 12, marginTop: 6 }}
      testID="follow-up-offer"
    >
      <Button
        label={tr('Send to {name}', { name })}
        size="sm"
        loading={busy}
        onPress={() => void send()}
        testID="follow-up-send"
      />
      <Button
        label={tr('Change it first')}
        size="sm"
        variant="secondary"
        onPress={() =>
          router.navigate({
            pathname: '/c/[id]',
            params: { id: offer.conversationId, say: offer.draft },
          })
        }
        testID="follow-up-edit"
      />
    </View>
  );
}
