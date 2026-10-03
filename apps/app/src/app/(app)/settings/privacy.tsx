import { msg, tr } from '@caime/core/i18n';
import type { Audience, PrivacyField } from '@caime/core/privacy';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useAiStatus } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const FIELDS: Array<{ field: PrivacyField; label: string }> = [
  { field: 'profilePhoto', label: msg('Profile photo') },
  { field: 'bio', label: msg('About you') },
  { field: 'pronouns', label: msg('Pronouns') },
  { field: 'status', label: msg('Status') },
  { field: 'onlineStatus', label: msg('When you’re online') },
  { field: 'lastSeen', label: msg('Last seen') },
  { field: 'readReceipts', label: msg('Read receipts') },
  { field: 'identityDetails', label: msg('Work details') },
  { field: 'busy', label: msg('When you’re in a meeting') },
  { field: 'busyDetails', label: msg('What the meeting is') },
];

type Kind = Audience['kind'];

function describe(a: Audience | undefined): string {
  if (!a) return tr('Your connections');
  switch (a.kind) {
    case 'everyone':
      return 'Everyone';
    case 'connections':
      return tr('Your connections');
    case 'nobody':
      return 'Nobody';
    case 'spheres':
      return a.spheres.length
        ? a.spheres.map((s) => tr(SPHERE_DEFS[s].plural)).join(', ')
        : tr('Some of your people');
  }
}

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
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: t.c.successSoft }}>
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
              subtitle={describe(me.privacy.fields[f.field])}
              chevron
              onPress={() => setEditing(f.field)}
            />
          </View>
        ))}
      </Group>
      <Group title={tr('Finding you')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr('By your name or @handle')}</Text>
            <Text variant="caption" color="textSecondary">
              {tr(
                'People can search for {displayName} or @{handle}, and your public page (what you show to everyone) is on the web',
                { displayName: me.displayName, handle: me.handle },
              )}
            </Text>
          </View>
          <Switch
            value={me.privacy.discoverByHandle}
            onValueChange={(v) => void save({ discoverByHandle: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel={tr('Findable by name or handle')}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: t.c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr('By your email')}</Text>
            <Text variant="caption" color="textSecondary">
              {me.minor
                ? tr('Always off under 18')
                : tr('Someone who knows your email can find you')}
            </Text>
          </View>
          <Switch
            value={me.privacy.discoverByEmail}
            disabled={me.minor}
            onValueChange={(v) => void save({ discoverByEmail: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel={tr('Findable by email')}
          />
        </View>
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
        <Choice
          label={tr('Who can send you a message request')}
          value={me.privacy.messageRequests}
          onChange={(messageRequests) => void save({ messageRequests })}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{tr('Use AI assist')}</Text>
              <Text variant="caption" color="textSecondary">
                {me.minor
                  ? tr('Available from 18')
                  : tr('Rewrite drafts, translate messages, catch up and find follow-ups')}
              </Text>
            </View>
            <Switch
              value={me.aiEnabled && !me.minor}
              disabled={me.minor}
              onValueChange={(v) => void setAi(v)}
              trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
              accessibilityLabel={tr('Use AI assist')}
              testID="ai-toggle"
            />
          </View>
        </Group>
      ) : null}
      {editing ? (
        <AudienceSheet
          key={editing}
          title={editingLabel}
          current={current}
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

/** Who sees one thing: everyone, the people they're connected with, only some kinds of them, or nobody. */
function AudienceSheet({
  title,
  current,
  onClose,
  onSave,
}: {
  title: string;
  current: Audience | undefined;
  onClose: () => void;
  onSave: (a: Audience) => void;
}) {
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'connections');
  const [spheres, setSpheres] = useState<Sphere[]>(
    current?.kind === 'spheres' ? current.spheres : [],
  );
  const some = kind === 'spheres';
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        some ? (
          <Button
            label={tr('Save')}
            size="lg"
            block
            disabled={!spheres.length}
            onPress={() => onSave({ kind: 'spheres', spheres })}
            testID="audience-save"
          />
        ) : undefined
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <Choice<Kind>
          label={title}
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k !== 'spheres') onSave({ kind: k } as Audience);
          }}
          options={[
            { value: 'everyone', label: tr('Everyone') },
            { value: 'connections', label: tr('Your connections') },
            {
              value: 'spheres',
              label: tr('Only some of your people'),
              detail: tr('By how you know them'),
            },
            { value: 'nobody', label: tr('Nobody') },
          ]}
        />
      </View>
      {some ? (
        <View
          accessibilityLabel={tr('Who sees it')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}
        >
          {SPHERES.map((s) => {
            const on = spheres.includes(s);
            return (
              <Chip
                key={s}
                label={tr(SPHERE_DEFS[s].plural)}
                selected={on}
                onPress={() => setSpheres((all) => (on ? all.filter((x) => x !== s) : [...all, s]))}
                testID={`audience-${s}`}
              />
            );
          })}
        </View>
      ) : null}
    </Sheet>
  );
}
