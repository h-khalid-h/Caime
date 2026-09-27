/**
 * Automations (PRD §69), all in one place: what Caishy keeps of what arrives, when it reminds
 * you that someone hasn't answered, and when it keeps quiet. The last two are rules
 * (Notifications and priorities): here they're listed as what they do, and open the same rule.
 * Nothing here happens until it's set up.
 */
import type { AutomationView, PolicyView } from '@caishy/core/api';
import { resolvePolicy, scheduleText } from '@caishy/core/policy';
import { findRole, SPHERE_DEFS, SPHERES, type Sphere } from '@caishy/core/taxonomy';
import { workHours } from '@caishy/core/time';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useAutomations, usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';
import { AutomationSheet } from '@/features/settings/AutomationSheet';
import { RuleSheet } from '@/features/settings/RuleSheet';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Bookmark, Clock, Moon } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** Who a rule is for, as it reads in a sentence: "vendors", "managers", "people from work". */
function whom(p: Pick<PolicyView, 'scope'>): string {
  const { sphere, role } = p.scope;
  if (p.scope.connectionId) return 'this person';
  if (!sphere) return 'everyone else';
  const r = findRole(sphere, role);
  if (r) return r.plural.toLowerCase();
  switch (sphere) {
    case 'work':
      return 'people from work';
    case 'community':
      return 'people from your community';
    case 'public':
      return 'people you don’t know';
    case 'other':
      return 'everyone else';
    default:
      return SPHERE_DEFS[sphere].plural.toLowerCase();
  }
}

/** Who a rule is for, as a label: its name, or "Work · Managers". */
function label(p: Pick<PolicyView, 'name' | 'scope'>): string {
  if (p.name) return p.name;
  const { sphere, role } = p.scope;
  if (!sphere) return 'Everyone else';
  const r = findRole(sphere, role);
  return SPHERE_DEFS[sphere].plural + (r ? ` · ${r.plural}` : '');
}

const inWords = (hours: number) =>
  hours % 168 === 0
    ? `${hours / 168 === 1 ? 'a week' : `${hours / 168} weeks`}`
    : hours % 24 === 0
      ? `${hours / 24 === 1 ? 'a day' : `${hours / 24} days`}`
      : `${hours} hours`;

/** A kind of relationship, for a reminder or quiet hours: made (or found) as its rule. */
function RuleFor({
  open,
  title,
  subtitle,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onPick: (sphere: Sphere) => Promise<void>;
}) {
  const [sphere, setSphere] = useState<Sphere>('vendor');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <Button
          label="Next"
          block
          size="lg"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onPick(sphere);
            } finally {
              setBusy(false);
            }
          }}
          testID="rule-for-next"
        />
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <Choice<Sphere>
          label="Who it’s for"
          value={sphere}
          onChange={setSphere}
          options={SPHERES.filter((s) => s !== 'other').map((s) => ({
            value: s,
            label: SPHERE_DEFS[s].plural,
          }))}
        />
      </View>
    </Sheet>
  );
}

function AutomationRow({ a, onOpen }: { a: AutomationView; onOpen: () => void }) {
  const qc = useQueryClient();
  const t = useTheme();
  const [on, setOn] = useState(a.enabled);
  const flip = async (v: boolean) => {
    setOn(v);
    try {
      await endpoints.updateAutomation(a.id, { enabled: v });
      void qc.invalidateQueries({ queryKey: qk.automations });
    } catch (e) {
      setOn(!v);
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <ListRow
      icon={Bookmark}
      title={a.description}
      subtitle={!on ? 'Off' : a.runs ? `${a.runs} kept so far` : 'Nothing kept yet'}
      onPress={onOpen}
      right={
        <Switch
          value={on}
          onValueChange={(v) => void flip(v)}
          trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
          accessibilityLabel={`${a.description}: ${on ? 'on' : 'off'}`}
          testID="automation-toggle"
        />
      }
      testID="automation-row"
    />
  );
}

export default function Automations() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const automations = useAutomations();
  const policies = usePolicies();
  const [editing, setEditing] = useState<AutomationView | 'new' | null>(null);
  const [rule, setRule] = useState<string | null>(null);
  const [adding, setAdding] = useState<'reminder' | 'quiet' | null>(null);
  const all = policies.data?.policies ?? [];
  const mine = automations.data?.automations ?? [];
  // What rules say for themselves, not what they take from broader ones.
  const reminders = all.filter((p) => !p.scope.connectionId && p.settings.followUpHours);
  const quiet = all.filter((p) => !p.scope.connectionId && p.settings.notify === 'schedule');
  const open = rule ? (all.find((p) => p.id === rule) ?? null) : null;
  const make = async (sphere: Sphere, kind: 'reminder' | 'quiet') => {
    try {
      const existing = all.find(
        (p) =>
          !p.scope.connectionId && !p.scope.orgId && !p.scope.role && p.scope.sphere === sphere,
      );
      const settings =
        kind === 'reminder'
          ? { followUpHours: existing?.settings.followUpHours ?? 48 }
          : {
              notify: 'schedule' as const,
              schedule: existing?.settings.schedule ?? workHours(me.workweek),
            };
      const { id } = await endpoints.createPolicy({ scope: { sphere }, settings });
      await qc.invalidateQueries({ queryKey: qk.policies });
      setAdding(null);
      setRule(id);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <SettingsPage title="Automations">
      <Text variant="body" color="textSecondary">
        What Caishy does for you by itself, only as you set it up here: keeping what arrives,
        reminding you when someone hasn’t answered, and keeping quiet when you’d rather it did.
      </Text>
      <Group
        title="Keep what arrives"
        footer="Kept in your Saved collections, for as long as its message is there."
      >
        {mine.length ? (
          mine.map((a, i) => (
            <View key={a.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
              <AutomationRow a={a} onOpen={() => setEditing(a)} />
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            None yet. For instance: when a customer sends a file with “invoice”, save it to Customer
            Files.
          </Text>
        )}
      </Group>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button
          label="Add an automation"
          variant="secondary"
          onPress={() => setEditing('new')}
          testID="automation-add"
        />
        <Button
          label="Saved"
          variant="ghost"
          onPress={() => router.navigate('/settings/saved')}
          testID="automations-saved"
        />
      </View>
      <Group
        title="Remind me"
        footer="When they haven’t answered a question or a request of yours."
      >
        {reminders.map((p, i) => (
          <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              icon={Clock}
              title={`If ${whom(p)} haven’t answered in ${inWords(p.settings.followUpHours ?? 0)}`}
              subtitle={p.name}
              chevron
              onPress={() => setRule(p.id)}
              testID="reminder-row"
            />
          </View>
        ))}
        <ListRow
          title="Add a reminder"
          onPress={() => setAdding('reminder')}
          testID="reminder-add"
          style={reminders.length ? { borderTopWidth: 1, borderTopColor: t.c.border } : undefined}
        />
      </Group>
      <Group
        title="Quiet hours"
        footer="Outside these hours they wait, unless it’s urgent and you allow that."
      >
        {quiet.map((p, i) => (
          <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              icon={Moon}
              title={`${label(p)}: ${
                p.settings.schedule ? scheduleText(p.settings.schedule) : 'in set hours'
              }`}
              chevron
              onPress={() => setRule(p.id)}
              testID="quiet-row"
            />
          </View>
        ))}
        <ListRow
          title="Add quiet hours"
          onPress={() => setAdding('quiet')}
          testID="quiet-add"
          style={quiet.length ? { borderTopWidth: 1, borderTopColor: t.c.border } : undefined}
        />
      </Group>
      {editing ? (
        <AutomationSheet
          key={editing === 'new' ? 'new' : editing.id}
          automation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {open ? (
        <RuleSheet
          key={open.id}
          rule={open}
          inherited={resolvePolicy(
            all.filter((x) => x.id !== open.id),
            { sphere: open.scope.sphere ?? null, role: open.scope.role, orgId: open.scope.orgId },
          )}
          title={label(open)}
          subtitle={open.description}
          open
          onClose={() => setRule(null)}
        />
      ) : null}
      <RuleFor
        open={adding !== null}
        title={adding === 'quiet' ? 'Quiet hours' : 'A reminder'}
        subtitle={
          adding === 'quiet'
            ? 'Whose messages wait for set hours'
            : 'Whose answers you’d like to be reminded about'
        }
        onClose={() => setAdding(null)}
        onPick={(sphere) => make(sphere, adding ?? 'reminder')}
      />
    </SettingsPage>
  );
}
