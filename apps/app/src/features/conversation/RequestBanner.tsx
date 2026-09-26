import type { ConversationView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ShieldCheck } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/**
 * A message from someone you're not connected with (R14), or from an organization that wrote to
 * you first: you decide, and nothing is shown as read until you do.
 */
export function RequestBanner({ conversation }: { conversation: ConversationView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'decline' | 'block' | null>(null);
  const other = conversation.other?.person;
  const org = conversation.business?.org ?? null;
  if (conversation.request !== 'incoming') {
    if (conversation.request === 'outgoing')
      return (
        <View
          style={{ margin: 12, padding: 12, borderRadius: 14, backgroundColor: t.c.surfaceMuted }}
          testID="request-outgoing"
        >
          <Text variant="caption" color="textSecondary" align="center">
            {org
              ? `${conversation.business?.thread?.customer?.displayName ?? 'They'} will see this as a message request from ${org.name}.`
              : `${other?.displayName ?? 'They'} will see this as a message request until they accept.`}
          </Text>
        </View>
      );
    return null;
  }
  const leave = (message: string) => {
    void qc.invalidateQueries({ queryKey: qk.inbox });
    toast(message);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const answer = async (decision: 'accept' | 'decline') => {
    setBusy(decision);
    try {
      await endpoints.answerRequest(conversation.id, decision);
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      void qc.invalidateQueries({ queryKey: qk.inbox });
      if (decision === 'decline') leave('Declined. They won’t be told.');
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const block = async () => {
    if (!org) return;
    setBusy('block');
    try {
      await endpoints.blockOrg(org.id);
      leave(`Blocked ${org.name}. It can’t write to you; unblock it from its page.`);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  if (org)
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
        testID="request-incoming"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <OrgMark kind={org.kind} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{`${org.name} wrote to you first`}</Text>
            <VerifiedLine org={org} />
          </View>
        </View>
        <Text variant="body" color="textSecondary">
          {`You haven’t written to ${org.name} before. It won’t know you’ve seen this unless you accept, and it can’t write again until you do.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button label="Accept" onPress={() => answer('accept')} loading={busy === 'accept'} />
          <Button
            label="Decline"
            variant="secondary"
            onPress={() => answer('decline')}
            loading={busy === 'decline'}
          />
          <Button
            label={`Block ${org.name}`}
            variant="ghost"
            onPress={() => void block()}
            loading={busy === 'block'}
          />
        </View>
      </View>
    );
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
