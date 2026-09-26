import type { PolicyView } from '@caishy/core/api';
import type { NotifyMode, Priority } from '@caishy/core/policy';
import { SPHERE_DEFS } from '@caishy/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scopeLabel(p: PolicyView): string {
  if (p.name) return p.name;
  if (p.scope.connectionId) return 'One person';
  if (p.scope.sphere)
    return SPHERE_DEFS[p.scope.sphere].plural + (p.scope.role ? ` · ${p.scope.role}` : '');
  return 'Everyone else';
}

export default function Notifications() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const q = usePolicies();
  const [editing, setEditing] = useState<PolicyView | null>(null);
  const policies = (q.data?.policies ?? []).filter((p) => !p.scope.connectionId);

  const update = async (p: PolicyView, settings: Record<string, unknown>) => {
    setEditing((e) => (e ? { ...e, settings: { ...e.settings, ...settings } } : e));
    try {
      await endpoints.updatePolicy(p.id, { settings });
      void qc.invalidateQueries({ queryKey: qk.policies });
      void qc.invalidateQueries({ queryKey: qk.inbox });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <SettingsPage title="Notifications and priorities">
      <Text variant="body" color="textSecondary">
        Caishy decides who reaches you by how you know them. Family can always get through; work
        waits for work hours; everyone else stays quiet unless it’s important. Change any of it.
      </Text>
      <Group title="By relationship">
        {policies.map((p, i) => (
          <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              left={
                p.scope.sphere ? (
                  <RelationshipChip label={scopeLabel(p)} sphere={p.scope.sphere} size="md" />
                ) : null
              }
              title={p.scope.sphere ? '' : scopeLabel(p)}
              subtitle={p.description}
              chevron
              onPress={() => setEditing(p)}
            />
          </View>
        ))}
      </Group>
      <Group
        title="Your work week"
        footer="Work notifications wait for these days. Set from your region; change it if yours is different."
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 }}>
          {DAYS.map((d, i) => (
            <View
              key={d}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: me.workweek.includes(i) ? t.c.primary : t.c.surfaceMuted,
              }}
            >
              <Text
                variant="captionStrong"
                color={me.workweek.includes(i) ? t.c.onPrimary : t.c.textSecondary}
              >
                {d}
              </Text>
            </View>
          ))}
        </View>
      </Group>
      <Button
        label="Reset to Caishy’s defaults"
        variant="ghost"
        onPress={async () => {
          await endpoints
            .resetPolicies()
            .catch((e) => toast((e as Error).message, { tone: 'danger' }));
          void qc.invalidateQueries({ queryKey: qk.policies });
          toast('Back to the defaults');
        }}
      />
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? scopeLabel(editing) : ''}
        subtitle={editing?.description}
      >
        {editing ? (
          <>
            <Text variant="overline" color="textTertiary">
              Notifications
            </Text>
            <View style={{ marginHorizontal: -20 }}>
              <Choice<NotifyMode>
                label="Notifications"
                value={editing.settings.notify ?? 'always'}
                onChange={(notify) => void update(editing, { notify })}
                options={[
                  { value: 'always', label: 'Always', detail: 'Any time they write' },
                  {
                    value: 'schedule',
                    label: 'In work hours',
                    detail: 'Held until your work week starts',
                  },
                  {
                    value: 'important_only',
                    label: 'Only if important',
                    detail: 'Questions, requests, mentions, urgent',
                  },
                  { value: 'mute', label: 'Never', detail: 'Still in your inbox, never a sound' },
                ]}
              />
            </View>
            <Text variant="overline" color="textTertiary">
              In your inbox
            </Text>
            <View style={{ marginHorizontal: -20 }}>
              <Choice<Priority>
                label="Priority"
                value={editing.settings.priority ?? 'normal'}
                onChange={(priority) => void update(editing, { priority })}
                options={[
                  { value: 'priority', label: 'Priority', detail: 'Near the top, under Important' },
                  { value: 'normal', label: 'Normal' },
                  {
                    value: 'quiet',
                    label: 'Quiet',
                    detail: 'Tucked away unless they ask you something',
                  },
                ]}
              />
            </View>
          </>
        ) : null}
      </Sheet>
    </SettingsPage>
  );
}
