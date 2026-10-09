import type { PolicyView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { resolvePolicy } from '@caime/core/policy';
import { findRole, ROLES, SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { workHours } from '@caime/core/time';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';
import { DayPicker } from '@/features/settings/DayPicker';
import { RuleFor } from '@/features/settings/RuleFor';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { useMe, useSession } from '@/state/session';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

// Loaded here only: everything about this browser's notifications stays out of the first download.
const BrowserNotifications = lazyPart(() =>
  import('@/features/push/BrowserNotifications').then((m) => m.BrowserNotifications),
);
// The rule editor is shared with a person's page and Automations: its own file, loaded when opened.
const RuleSheet = lazyPart(() => import('@/features/settings/RuleSheet').then((m) => m.RuleSheet));

/** Who a rule is for: "Work · Manager", "Customers", or its name when it has one. */
function scopeLabel(p: Pick<PolicyView, 'name' | 'scope'>): string {
  if (p.name) return p.name;
  if (p.scope.connectionId) return tr('One person');
  const { sphere, role } = p.scope;
  if (sphere) {
    const r = findRole(sphere, role);
    return tr(SPHERE_DEFS[sphere].plural) + (role ? ` · ${r ? tr(r.plural) : role}` : '');
  }
  return tr('Everyone else');
}

/** What applies to a rule's people where it says nothing: the broader rules around it. */
function inheritedFor(p: PolicyView, all: PolicyView[]) {
  return resolvePolicy(
    all.filter((x) => x.id !== p.id),
    { sphere: p.scope.sphere ?? null, role: p.scope.role, orgId: p.scope.orgId },
  );
}

/** A rule of one's own (PRD §68, §70): for a kind of relationship, or a role in it. */
function NewRule({
  open,
  onClose,
  onMade,
}: {
  open: boolean;
  onClose: () => void;
  onMade: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [sphere, setSphere] = useState<Sphere>('customer');
  const [role, setRole] = useState<string>('all');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      // The same people again is the rule they have, given the name if there is one.
      const trimmed = name.trim();
      const made = await endpoints.createPolicy({
        ...(trimmed ? { name: trimmed } : {}),
        scope: { sphere, role: role === 'all' ? null : role },
        settings: {},
      });
      if (made.existing) toast(tr('They have a rule already: here it is'));
      await qc.invalidateQueries({ queryKey: qk.policies });
      setName('');
      onMade(made.id);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('A new rule')}
      subtitle={tr('For everyone you know one way, or in one role')}
      footer={
        <Button
          label={tr('Make the rule')}
          block
          size="lg"
          loading={busy}
          onPress={() => void make()}
          testID="rule-make"
        />
      }
    >
      <View style={{ gap: 12 }}>
        <Text variant="overline" color="textTertiary" accessibilityRole="header">
          {tr('Who it’s for')}
        </Text>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<Sphere>
            label={tr('Who it’s for')}
            value={sphere}
            onChange={(v) => {
              setSphere(v);
              setRole('all');
            }}
            options={SPHERES.filter((s) => s !== 'other').map((s) => ({
              value: s,
              label: tr(SPHERE_DEFS[s].plural),
            }))}
          />
        </View>
        {ROLES[sphere].length ? (
          <>
            <Text variant="overline" color="textTertiary" accessibilityRole="header">
              {tr('Of them')}
            </Text>
            <View style={{ marginHorizontal: -20 }}>
              <Choice<string>
                label={tr('Of them')}
                value={role}
                onChange={setRole}
                options={[
                  {
                    value: 'all',
                    label: tr('All {toLowerCase}', {
                      toLowerCase: tr(SPHERE_DEFS[sphere].plural).toLowerCase(),
                    }),
                  },
                  ...ROLES[sphere].map((r) => ({ value: r.id, label: tr(r.plural) })),
                ]}
              />
            </View>
          </>
        ) : null}
        <TextField
          label={tr('Its name (optional)')}
          value={name}
          onChangeText={setName}
          placeholder={tr('My customers')}
          maxLength={60}
          testID="rule-new-name"
        />
      </View>
    </Sheet>
  );
}

export default function Notifications() {
  const t = useTheme();
  const prefs = usePrefs();
  const qc = useQueryClient();
  const me = useMe();
  const q = usePolicies();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Quiet hours are rules too (whose messages wait for set hours): made here, beside the rest,
  // from the work week, then opened to change the hours.
  const [addingQuiet, setAddingQuiet] = useState(false);
  const all = q.data?.policies ?? [];
  // One person's rules are on their page.
  const policies = all.filter((p) => !p.scope.connectionId);
  const rule = editing ? (all.find((p) => p.id === editing) ?? null) : null;
  const makeQuiet = async (sphere: Sphere) => {
    try {
      const existing = all.find(
        (p) =>
          !p.scope.connectionId && !p.scope.orgId && !p.scope.role && p.scope.sphere === sphere,
      );
      const { id } = await endpoints.createPolicy({
        scope: { sphere },
        settings: {
          notify: 'schedule' as const,
          schedule: existing?.settings.schedule ?? workHours(me.workweek),
        },
      });
      await qc.invalidateQueries({ queryKey: qk.policies });
      setAddingQuiet(false);
      setEditing(id);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const saveWeek = async (workweek: number[]) => {
    try {
      const { user } = await endpoints.updateMe({ workweek });
      useSession.getState().setUser(user);
      void qc.invalidateQueries({ queryKey: qk.inbox });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <SettingsPage title={tr('Notifications and priorities')}>
      <Text variant="body" color="textSecondary">
        {tr(
          'Caime decides who reaches you by how you know them. Family can always get through; work waits for work hours; everyone else stays quiet unless it’s important. Change any of it, or make rules of your own.',
        )}
      </Text>
      <BrowserNotifications />
      <Group title={tr('By relationship')}>
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
              accessibilityLabel={`${scopeLabel(p)}, ${p.description}`}
              chevron
              onPress={() => setEditing(p.id)}
              testID="rule-row"
            />
          </View>
        ))}
      </Group>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          label={tr('Add a rule')}
          variant="secondary"
          onPress={() => setAdding(true)}
          testID="rule-add"
        />
        <Button
          label={tr('Add quiet hours')}
          variant="secondary"
          onPress={() => setAddingQuiet(true)}
          testID="quiet-add"
        />
      </View>
      <RuleFor
        open={addingQuiet}
        title={tr('Quiet hours')}
        subtitle={tr('Whose messages wait for set hours')}
        onClose={() => setAddingQuiet(false)}
        onPick={makeQuiet}
      />
      <Group title={tr('While you’re in a meeting')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr('Work waits until it ends')}</Text>
            <Text variant="caption" color="textSecondary">
              {tr(
                'In a meeting or appointment agreed in Caime, messages from work, customers, vendors and professionals are held until it ends. Family, friends and calls come through.',
              )}
            </Text>
          </View>
          <Switch
            value={Boolean(prefs.holdWhileBusy)}
            onValueChange={(v) => savePrefs({ holdWhileBusy: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel={tr('Work waits until the meeting ends')}
            testID="hold-while-busy"
          />
        </View>
      </Group>
      <Group
        title={tr('Your work week')}
        footer={tr(
          'Work notifications wait for these days. Set from where you live (Language and region); change them if yours are different.',
        )}
      >
        <View style={{ padding: 16 }}>
          <DayPicker
            label={tr('Your work week')}
            days={me.workweek}
            onChange={(d) => void saveWeek(d)}
          />
        </View>
      </Group>
      <Button
        label={tr('Reset to Caime’s defaults')}
        variant="ghost"
        onPress={async () => {
          await endpoints
            .resetPolicies()
            .catch((e) => toast((e as Error).message, { tone: 'danger' }));
          void qc.invalidateQueries({ queryKey: qk.policies });
          toast(tr('Back to the defaults'));
        }}
      />
      {rule ? (
        <RuleSheet
          key={rule.id}
          rule={rule}
          inherited={inheritedFor(rule, all)}
          title={scopeLabel(rule)}
          subtitle={rule.description}
          open
          onClose={() => setEditing(null)}
        />
      ) : null}
      <NewRule
        open={adding}
        onClose={() => setAdding(false)}
        onMade={(id) => {
          setAdding(false);
          setEditing(id);
        }}
      />
    </SettingsPage>
  );
}
