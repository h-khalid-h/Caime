import type { ConversationView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
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
  const [blocking, setBlocking] = useState(false);
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
              ? tr('{displayName} will see this as a message request from {name}.', {
                  displayName: conversation.business?.thread?.customer?.displayName ?? tr('They'),
                  name: org.name,
                })
              : tr('{displayName} will see this as a message request until they accept.', {
                  displayName: other?.displayName ?? tr('They'),
                })}
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
    setBlocking(false);
    setBusy('block');
    try {
      await endpoints.blockOrg(org.id);
      leave(
        tr('Blocked {name}. It can’t write to you; unblock it from its page.', { name: org.name }),
      );
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
          <OrgMark kind={org.kind} url={org.avatarUrl} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{tr('{name} wrote to you first', { name: org.name })}</Text>
            <VerifiedLine org={org} />
          </View>
        </View>
        <Text variant="body" color="textSecondary">
          {tr(
            'You haven’t written to {name} before. It won’t know you’ve seen this unless you accept, and it can’t write again until you do.',
            { name: org.name },
          )}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            label={tr('Accept')}
            onPress={() => answer('accept')}
            loading={busy === 'accept'}
          />
          <Button
            label={tr('Decline')}
            variant="secondary"
            onPress={() => answer('decline')}
            loading={busy === 'decline'}
          />
          <Button
            label={tr('Block {name}', { name: org.name })}
            variant="ghost"
            onPress={() => setBlocking(true)}
            loading={busy === 'block'}
            testID="request-block-org"
          />
          <Sheet
            open={blocking}
            onClose={() => setBlocking(false)}
            title={tr('Block {name}?', { name: org.name })}
            subtitle={tr(
              'It can’t write to you, and this conversation closes. You can unblock it from its page any time.',
            )}
            footer={
              <Button
                label={tr('Block')}
                variant="danger"
                block
                size="lg"
                onPress={() => void block()}
                testID="request-block-org-confirm"
              />
            }
          >
            <Text variant="body" color="textSecondary">
              {tr('Nobody on its team is told you blocked it.')}
            </Text>
          </Sheet>
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
          {other?.displayName ?? tr('Someone')} wants to message you
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        You’re not connected. {other?.trust.detail ?? ''} They won’t know you’ve seen this unless
        you reply.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={tr('Accept')} onPress={() => answer('accept')} loading={busy === 'accept'} />
        <Button
          label={tr('Decline')}
          variant="secondary"
          onPress={() => answer('decline')}
          loading={busy === 'decline'}
        />
      </View>
    </View>
  );
}
