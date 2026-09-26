import type { Audience, PrivacyField } from '@caishy/core/privacy';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const FIELDS: Array<{ field: PrivacyField; label: string }> = [
  { field: 'profilePhoto', label: 'Profile photo' },
  { field: 'bio', label: 'About you' },
  { field: 'pronouns', label: 'Pronouns' },
  { field: 'status', label: 'Status' },
  { field: 'onlineStatus', label: 'When you’re online' },
  { field: 'lastSeen', label: 'Last seen' },
  { field: 'readReceipts', label: 'Read receipts' },
  { field: 'identityDetails', label: 'Work details' },
];

type Simple = 'everyone' | 'connections' | 'nobody';

function describe(a: Audience | undefined): string {
  if (!a) return 'Your connections';
  switch (a.kind) {
    case 'everyone':
      return 'Everyone';
    case 'connections':
      return 'Your connections';
    case 'nobody':
      return 'Nobody';
    case 'spheres':
      return 'Some of your people';
  }
}

export default function Privacy() {
  const t = useTheme();
  const me = useMe();
  const [editing, setEditing] = useState<PrivacyField | null>(null);
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
  const editingLabel = FIELDS.find((f) => f.field === editing)?.label ?? '';
  return (
    <SettingsPage title="Privacy">
      {me.minor ? (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: t.c.successSoft }}>
          <Text variant="bodyStrong" color="success">
            Extra protection is on
          </Text>
          <Text variant="caption" color="textSecondary">
            Because you’re under 18, adults you don’t know can’t find you, and only people you share
            a connection with can message you.
          </Text>
        </View>
      ) : null}
      <Group
        title="Who can see"
        footer="Read receipts are two-way: you see theirs only if they see yours."
      >
        {FIELDS.map((f, i) => (
          <View key={f.field} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              title={f.label}
              subtitle={describe(me.privacy.fields[f.field])}
              chevron
              onPress={() => setEditing(f.field)}
            />
          </View>
        ))}
      </Group>
      <Group title="Finding you">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">By your @handle</Text>
            <Text variant="caption" color="textSecondary">
              People can search for @{me.handle}
            </Text>
          </View>
          <Switch
            value={me.privacy.discoverByHandle}
            onValueChange={(v) => void save({ discoverByHandle: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Findable by handle"
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
            <Text variant="bodyStrong">By your email</Text>
            <Text variant="caption" color="textSecondary">
              {me.minor ? 'Always off under 18' : 'Someone who knows your email can find you'}
            </Text>
          </View>
          <Switch
            value={me.privacy.discoverByEmail}
            disabled={me.minor}
            onValueChange={(v) => void save({ discoverByEmail: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Findable by email"
          />
        </View>
      </Group>
      <Group
        title="Message requests"
        footer="Messages from people you’re not connected with wait in Requests. They never interrupt you."
      >
        <Choice
          label="Who can send you a message request"
          value={me.privacy.messageRequests}
          onChange={(messageRequests) => void save({ messageRequests })}
          options={[
            { value: 'everyone', label: 'Anyone' },
            { value: 'shared_connections', label: 'People you share a connection with' },
            { value: 'nobody', label: 'Nobody' },
          ]}
        />
      </Group>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editingLabel}>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<Simple>
            label={editingLabel}
            value={
              (current?.kind === 'spheres'
                ? 'connections'
                : (current?.kind ?? 'connections')) as Simple
            }
            onChange={(kind) => {
              if (editing) void save({ fields: { [editing]: { kind } } });
              setEditing(null);
            }}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'connections', label: 'Your connections' },
              { value: 'nobody', label: 'Nobody' },
            ]}
          />
        </View>
      </Sheet>
    </SettingsPage>
  );
}
