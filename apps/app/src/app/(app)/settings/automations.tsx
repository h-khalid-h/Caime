/**
 * Automations (PRD §69), all in one place: what Caime keeps of what arrives, when it reminds
 * you that someone hasn't answered, and when it keeps quiet. The last two are rules
 * (Notifications and priorities): here they're listed as what they do, and open the same rule.
 * Nothing here happens until it's set up.
 */
import type { AutomationView, PolicyView } from '@caime/core/api';
import { whoSends } from '@caime/core/automations';
import { tr, trn } from '@caime/core/i18n';
import { resolvePolicy } from '@caime/core/policy';
import { findRole, SPHERE_DEFS, type Sphere } from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Clock from 'lucide-react-native/icons/clock';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useAutomations, usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';
import { AutomationSheet } from '@/features/settings/AutomationSheet';
import { RuleFor } from '@/features/settings/RuleFor';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { patchCache } from '@/state/cache';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

// Shared with Notifications and a person's page: loaded when a rule is opened.
const RuleSheet = lazyPart(() => import('@/features/settings/RuleSheet').then((m) => m.RuleSheet));

/**
 * A reminder rule as one sentence (M16 D4): who it's for said as automations say it ("someone
 * you call “Vendor”", "someone from work"), never a word lowered into a sentence of another.
 */
function reminderLine(p: Pick<PolicyView, 'scope' | 'settings'>): string {
  const inWords_ = inWords(p.settings.followUpHours ?? 0);
  if (p.scope.connectionId)
    return tr('If this person hasn’t answered in {inWords}', { inWords: inWords_ });
  return tr('If {who} hasn’t answered in {inWords}', {
    who: whoSends({ sphere: p.scope.sphere ?? null, role: p.scope.role ?? null }),
    inWords: inWords_,
  });
}

/** Who a rule is for, as a label: its name (a template's, in the reader's words), or "Work · Managers". */
function label(p: Pick<PolicyView, 'name' | 'scope'>): string {
  if (p.name) return tr(p.name);
  const { sphere, role } = p.scope;
  if (!sphere) return tr('Everyone else');
  const r = findRole(sphere, role);
  return tr(SPHERE_DEFS[sphere].plural) + (r ? ` · ${tr(r.plural)}` : '');
}

const inWords = (hours: number) =>
  hours % 168 === 0
    ? trn(hours / 168, 'a week', '{n} weeks')
    : hours % 24 === 0
      ? trn(hours / 24, 'a day', '{n} days')
      : trn(hours, '{n} hour', '{n} hours');

function AutomationRow({ a, onOpen }: { a: AutomationView; onOpen: () => void }) {
  const qc = useQueryClient();
  const _t = useTheme();
  // As it's saved, here or on another device; turned here, it shows at once.
  const flip = async (enabled: boolean) => {
    const show = (on: boolean) =>
      patchCache<{ automations: AutomationView[] }>(qc, qk.automations, (old) =>
        old
          ? {
              ...old,
              automations: old.automations.map((x) => (x.id === a.id ? { ...x, enabled: on } : x)),
            }
          : old,
      );
    show(enabled);
    try {
      await endpoints.updateAutomation(a.id, { enabled });
    } catch (e) {
      show(!enabled);
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      void qc.invalidateQueries({ queryKey: qk.automations });
    }
  };
  const status = !a.enabled
    ? tr('Off')
    : a.runs
      ? tr('{runs} kept so far', { runs: a.runs })
      : tr('Nothing kept yet');
  // What it does opens it; the switch beside it turns it on or off, and is never inside it.
  return (
    <SwitchRow
      inset
      icon={Bookmark}
      label={a.description}
      detail={status}
      value={a.enabled}
      onChange={(v) => void flip(v)}
      onOpen={onOpen}
      rowTestID="automation-row"
      testID="automation-toggle"
    />
  );
}

export default function Automations() {
  const t = useTheme();
  const qc = useQueryClient();
  const _me = useMe();
  const automations = useAutomations();
  const policies = usePolicies();
  const [editing, setEditing] = useState<AutomationView | 'new' | null>(null);
  const [rule, setRule] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const all = policies.data?.policies ?? [];
  const mine = automations.data?.automations ?? [];
  // What rules say for themselves, not what they take from broader ones.
  const reminders = all.filter((p) => !p.scope.connectionId && p.settings.followUpHours);
  const open = rule ? (all.find((p) => p.id === rule) ?? null) : null;
  const make = async (sphere: Sphere) => {
    try {
      const existing = all.find(
        (p) =>
          !p.scope.connectionId && !p.scope.orgId && !p.scope.role && p.scope.sphere === sphere,
      );
      const settings = { followUpHours: existing?.settings.followUpHours ?? 48 };
      const { id } = await endpoints.createPolicy({ scope: { sphere }, settings });
      await qc.invalidateQueries({ queryKey: qk.policies });
      setAdding(false);
      setRule(id);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <SettingsPage title={tr('Automations')}>
      <Text variant="body" color="textSecondary">
        {tr(
          'What Caime does for you by itself, only as you set it up here: keeping what arrives, and reminding you when someone hasn’t answered. Who reaches you, and when, is under Notifications and priorities.',
        )}
      </Text>
      <Group
        title={tr('Keep what arrives')}
        footer={tr('Kept in your Saved collections, for as long as its message is there.')}
      >
        {automations.isPending ? (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            {tr('Loading your automations…')}
          </Text>
        ) : automations.isError && !mine.length ? (
          <View style={{ padding: 16, gap: 10, alignItems: 'flex-start' }}>
            <Text variant="body" color="textSecondary">
              {tr('Your automations didn’t load.')}
            </Text>
            <Button
              label={tr('Try again')}
              size="sm"
              variant="secondary"
              onPress={() => void automations.refetch()}
            />
          </View>
        ) : mine.length ? (
          mine.map((a, i) => (
            <View key={a.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
              <AutomationRow a={a} onOpen={() => setEditing(a)} />
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            {tr(
              'None yet. For instance: when a customer sends a file with “invoice”, save it to Customer Files.',
            )}
          </Text>
        )}
      </Group>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button
          label={tr('Add an automation')}
          variant="secondary"
          onPress={() => setEditing('new')}
          testID="automation-add"
        />
        <Button
          label={tr('Saved')}
          variant="ghost"
          onPress={() => router.navigate('/settings/saved')}
          testID="automations-saved"
        />
      </View>
      <Group
        title={tr('Remind me')}
        footer={tr('When they haven’t answered a question or a request of yours.')}
      >
        {reminders.map((p, i) => (
          <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              icon={Clock}
              title={reminderLine(p)}
              subtitle={p.name ? tr(p.name) : undefined}
              chevron
              onPress={() => setRule(p.id)}
              testID="reminder-row"
            />
          </View>
        ))}
        <ListRow
          title={tr('Add a reminder')}
          onPress={() => setAdding(true)}
          testID="reminder-add"
          style={reminders.length ? { borderTopWidth: 1, borderTopColor: t.c.border } : undefined}
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
        open={adding}
        title={tr('A reminder')}
        subtitle={tr('Whose answers you’d like to be reminded about')}
        onClose={() => setAdding(false)}
        onPick={make}
      />
    </SettingsPage>
  );
}
