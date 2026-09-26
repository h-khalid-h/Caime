import type { ConversationView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ShieldCheck } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** A message from someone you're not connected with (R14): you decide, nothing is shown as read. */
export function RequestBanner({ conversation }: { conversation: ConversationView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const other = conversation.other?.person;
  if (conversation.request !== 'incoming') {
    if (conversation.request === 'outgoing')
      return (
        <View
          style={{ margin: 12, padding: 12, borderRadius: 14, backgroundColor: t.c.surfaceMuted }}
        >
          <Text variant="caption" color="textSecondary" align="center">
            {other?.displayName ?? 'They'} will see this as a message request until they accept.
          </Text>
        </View>
      );
    return null;
  }
  const answer = async (decision: 'accept' | 'decline') => {
    setBusy(decision);
    try {
      await endpoints.answerRequest(conversation.id, decision);
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      void qc.invalidateQueries({ queryKey: qk.inbox });
      if (decision === 'decline') {
        toast('Declined. They won’t be told.');
        router.back();
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <View
      style={{
        margin: 12,
        padding: 16,
        borderRadius: 16,
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c.border,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={18} color={t.c.textSecondary} />
        <Text variant="label" style={{ flex: 1 }}>
          {other?.displayName ?? 'Someone'} wants to message you
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        You’re not connected. {other?.trust.detail ?? ''} They won’t know you’ve seen this unless
        you reply.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Accept" onPress={() => answer('accept')} loading={busy === 'accept'} />
        <Button
          label="Decline"
          variant="secondary"
          onPress={() => answer('decline')}
          loading={busy === 'decline'}
        />
      </View>
    </View>
  );
}
