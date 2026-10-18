import { msg, tr } from '@caime/core/i18n';
import type { PrivacyField } from '@caime/core/privacy';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useAiStatus } from '@/api/hooks';
import { qk } from '@/api/keys';
import { audienceLine } from '@/features/settings/audienceLine';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const AudienceSheet = lazyPart(() =>
  import('@/features/settings/AudienceSheet').then((m) => m.AudienceSheet),
);

const FIELDS: Array<{ field: PrivacyField; label: string }> = [
  { field: 'profilePhoto', label: msg('Profile photo') },
  { field: 'bio', label: msg('About you') },
  { field: 'pronouns', label: msg('Pronouns') },
  { field: 'gender', label: msg('Gender') },
  { field: 'status', label: msg('Status') },
  { field: 'onlineStatus', label: msg('When you’re online') },
  { field: 'lastSeen', label: msg('Last seen') },
  { field: 'readReceipts', label: msg('Read receipts') },
  { field: 'identityDetails', label: msg('Work details') },
  { field: 'busy', label: msg('When you’re in a meeting') },
  { field: 'busyDetails', label: msg('What the meeting is') },
];

export default function Privacy() {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const ai = useAiStatus();
  const [editing, setEditing] = useState<PrivacyField | null>(null);
  const setAi = async (aiEnabled: boolean) => {
    try {
      const res = await endpoints.updateMe({ aiEnabled });
      useSession.getState().setUser(res.user);
      void qc.invalidateQueries({ queryKey: qk.ai });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const save = async (body: Record<string, unknown>) => {
    try {
      const res = await endpoints.updatePrivacy(body);
      const user = useSession.getState().user;
      if (user) useSession.getState().setUser({ ...user, privacy: res.privacy });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const current = editing ? me.privacy.fields[editing] : undefined;
  const editingLabel = tr(FIELDS.find((f) => f.field === editing)?.label ?? '');
  return (
    <SettingsPage title={tr('Privacy')}>
      {me.minor ? (
        <View style={{ padding: 14, borderRadius: t.radii.lg, backgroundColor: t.c.successSoft }}>
          <Text variant="bodyStrong" color="success">
            {tr('Extra protection is on')}
          </Text>
          <Text variant="caption" color="textSecondary">
            {tr(
              'Because you’re under 18, adults you don’t know can’t find you, and only people you share a connection with can message you.',
            )}
          </Text>
        </View>
      ) : null}
      <Group
        title={tr('Who can see')}
        footer={tr('Read receipts are two-way: you see theirs only if they see yours.')}
      >
        {FIELDS.map((f, i) => (
          <View key={f.field} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              title={tr(f.label)}
              subtitle={audienceLine(me.privacy.fields[f.field])}
              chevron
              onPress={() => setEditing(f.field)}
            />
          </View>
        ))}
      </Group>
      <Group title={tr('Finding you')}>
        <SwitchRow
          inset
          label={tr('By your name or @handle')}
          detail={tr(
            'People can search for {displayName} or @{handle}, and your public page (what you show to everyone) is on the web',
            { displayName: me.displayName, handle: me.handle },
          )}
          value={me.privacy.discoverByHandle}
          onChange={(v) => void save({ discoverByHandle: v })}
          testID="find-by-handle"
        />
        <SwitchRow
          inset
          divider
          label={tr('By your email')}
          detail={
            me.minor ? tr('Always off under 18') : tr('Someone who knows your email can find you')
          }
          value={me.privacy.discoverByEmail}
          disabled={me.minor}
          onChange={(v) => void save({ discoverByEmail: v })}
          testID="find-by-email"
        />
        <SwitchRow
          inset
          divider
          label={tr('By your phone number')}
          detail={
            me.minor
              ? tr('Always off under 18')
              : tr('Someone with your number in their contacts can find you, once you’ve proven it')
          }
          value={me.privacy.discoverByPhone}
          disabled={me.minor}
          onChange={(v) => void save({ discoverByPhone: v })}
          testID="find-by-phone"
        />
      </Group>
      <Group
        title={tr('Message requests')}
        footer={
          me.minor
            ? tr(
                'Messages from people you’re not connected with wait in Requests. Under 18, only people you share a connection with can send one.',
              )
            : tr(
                'Messages from people you’re not connected with wait in Requests. They never interrupt you.',
              )
        }
      >
        <ChoiceSheet
          label={tr('Message requests')}
          value={me.privacy.messageRequests}
          onChange={(messageRequests) => void save({ messageRequests })}
          testID="message-requests"
          options={[
            // Not offered under 18: the server would only turn it back (R29).
            ...(me.minor ? [] : [{ value: 'everyone' as const, label: tr('Anyone') }]),
            { value: 'shared_connections', label: tr('People you share a connection with') },
            { value: 'nobody', label: tr('Nobody') },
          ]}
        />
      </Group>
      {ai.data?.available ? (
        <Group
          title={tr('AI assist')}
          footer={tr(
            'Only when you tap an AI action, Caime sends what that action needs (your draft, the message, or the conversation you asked about) to Anthropic, its AI provider, to write a suggestion. Anthropic doesn’t use it to train models. Private conversations are never sent. What it writes is labelled and changes nothing until you choose it.',
          )}
        >
          <SwitchRow
            inset
            label={tr('Use AI assist')}
            detail={
              me.minor
                ? tr('Available from 18')
                : tr('Rewrite drafts, translate messages, catch up and find follow-ups')
            }
            value={me.aiEnabled && !me.minor}
            disabled={me.minor}
            onChange={(v) => void setAi(v)}
            testID="ai-toggle"
          />
        </Group>
      ) : null}
      {editing ? (
        <AudienceSheet
          key={editing}
          title={editingLabel}
          current={current}
          minor={me.minor}
          onClose={() => setEditing(null)}
          onSave={(audience) => {
            void save({ fields: { [editing]: audience } });
            setEditing(null);
          }}
        />
      ) : null}
    </SettingsPage>
  );
}
