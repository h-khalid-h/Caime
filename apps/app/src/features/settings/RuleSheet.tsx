/**
 * One rule (PRD §68–70): how Caime treats a kind of relationship, a role in it, or one person.
 * Whatever it doesn't set comes from the broader rule it sits under (a role's from its
 * relationship's, one person's from how you know them), and shows as it applies. A named rule is
 * a template ("My Customers"). The rules themselves are the server's (policy.ts in core).
 */
import type { PolicyView } from '@caime/core/api';
import { msg, tr, trAll } from '@caime/core/i18n';
import type {
  AiTone,
  EffectivePolicy,
  NotifyMode,
  PolicyScope,
  PolicySettings,
  Priority,
  PrivacyPreset,
} from '@caime/core/policy';
import { type Schedule, workHours } from '@caime/core/time';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { DayPicker } from '@/features/settings/DayPicker';
import { Choice } from '@/features/settings/SettingsPage';
import { SwitchRow } from '@/features/settings/SwitchRow';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { TimeField } from '@/ui/TimeField';
import { toast } from '@/ui/Toast';

/** The server's limit on a rule's name. */
const NAME_MAX = 60;

const FOLLOW_UPS: Array<{ value: string; label: string; detail?: string }> = [
  { value: 'off', label: msg('Don’t remind me') },
  { value: '24', label: msg('After a day'), detail: msg('If they haven’t answered you by then') },
  { value: '48', label: msg('After 2 days') },
  { value: '72', label: msg('After 3 days') },
  { value: '168', label: msg('After a week') },
];

function Overline({ children }: { children: string }) {
  return (
    <Text variant="overline" color="textTertiary" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function RuleSheet({
  rule,
  scope: newScope,
  inherited,
  title,
  subtitle,
  open,
  onClose,
  deleteLabel,
  onDeleted,
}: {
  rule: PolicyView | null;
  /**
   * For a rule not made yet (one person's): what it would be for. It's made with its first change,
   * so there's never a rule of theirs that says nothing.
   */
  scope?: PolicyScope;
  /** What applies where this rule says nothing. */
  inherited: EffectivePolicy;
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  /** How taking the rule away reads here ("Treat Sam like other friends"). */
  deleteLabel?: string;
  onDeleted?: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  // What this rule says, changed here at once and saved as it changes.
  const [draft, setDraft] = useState<PolicySettings>(rule?.settings ?? {});
  const [name, setName] = useState(rule?.name ?? '');
  const [confirming, setConfirming] = useState(false);
  // The rule's id once it's saved, and how many changes are still on their way to the server.
  const ruleId = useRef(rule?.id ?? null);
  const pending = useRef(0);
  // Taken away here: nothing typed and not yet saved brings it back as the sheet closes.
  const removed = useRef(false);
  // Saved (here or on another device), the rule as it's stored now, once nothing changed here
  // is still on its way: an answer from before a change must never undo it. Another rule is
  // another sheet: callers key it by the rule (or the person) it's for.
  const seen = useRef(Boolean(rule?.id));
  useEffect(() => {
    if (rule?.id) {
      seen.current = true;
      ruleId.current ??= rule.id;
    } else if (seen.current && pending.current === 0) {
      // It was there and it's gone, taken away elsewhere (another device): the next change
      // makes it again, rather than changing one that no longer is.
      seen.current = false;
      ruleId.current = null;
    }
    if (pending.current === 0) setDraft(rule?.settings ?? {});
  }, [rule?.id, rule?.settings]);
  // Its name as renamed elsewhere, unless it's being typed here; and closed while it was being
  // typed, what was typed still counts (never a name it opened with, over a rename since).
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setName(rule?.name ?? '');
  }, [rule?.name]);
  const latestName = useRef({ name, saved: rule?.name ?? null });
  latestName.current = { name, saved: rule?.name ?? null };
  useEffect(
    () => () => {
      const next = latestName.current.name.trim() || null;
      if (typing.current && !removed.current && ruleId.current && next !== latestName.current.saved)
        void endpoints
          .updatePolicy(ruleId.current, { name: next })
          .then(() => qc.invalidateQueries({ queryKey: qk.policies }))
          .catch(() => {});
    },
    [qc],
  );
  const scope = rule?.scope ?? newScope;
  if (!scope) return null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.policies });
    void qc.invalidateQueries({ queryKey: qk.allPoliciesFor });
    void qc.invalidateQueries({ queryKey: qk.inbox });
    // A person's page says what they see of you.
    void qc.invalidateQueries({ queryKey: qk.allPeople });
  };
  const save = async (settings: PolicySettings) => {
    if (removed.current) return;
    setDraft((d) => ({ ...d, ...settings }));
    pending.current += 1;
    try {
      if (ruleId.current) await endpoints.updatePolicy(ruleId.current, { settings });
      // The first change makes it; one made meanwhile (another device) is the same rule.
      else
        ruleId.current = (
          await endpoints.createPolicy({ scope, settings: settings as Record<string, unknown> })
        ).id;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      pending.current -= 1;
      if (pending.current === 0) refresh();
    }
  };
  const saveName = async () => {
    const next = name.trim() || null;
    typing.current = false;
    if (!ruleId.current || next === (rule?.name ?? null)) return;
    try {
      await endpoints.updatePolicy(ruleId.current, { name: next });
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const remove = async () => {
    if (!ruleId.current) return;
    removed.current = true;
    try {
      await endpoints.deletePolicy(ruleId.current);
      refresh();
      toast(tr('Rule removed'));
      onDeleted?.();
      onClose();
    } catch (e) {
      removed.current = false;
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const pick = <K extends keyof PolicySettings>(k: K): EffectivePolicy[K & keyof EffectivePolicy] =>
    (draft[k] !== undefined ? draft[k] : inherited[k as keyof EffectivePolicy]) as never;
  const notify = pick('notify') as NotifyMode;
  const priority = pick('priority') as Priority;
  const inHoursOnly = Boolean(pick('priorityInScheduleOnly'));
  const schedule: Schedule = (pick('schedule') as Schedule | null) ?? workHours(me.workweek);
  const followUp = pick('followUpHours') as number | null;
  const hours = notify === 'schedule' || (priority === 'priority' && inHoursOnly);

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={{ gap: 12 }} testID="rule-sheet">
        {scope.connectionId ? null : (
          <TextField
            label={tr('Its name (optional)')}
            value={name}
            onChangeText={(v) => {
              typing.current = true;
              setName(v);
            }}
            onBlur={() => void saveName()}
            onSubmitEditing={() => void saveName()}
            placeholder={tr('My customers')}
            maxLength={NAME_MAX}
            testID="rule-name"
          />
        )}
        <Overline>{tr('Notifications')}</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<NotifyMode>
            label={tr('Notifications')}
            value={notify}
            onChange={(v) =>
              void save(
                v === 'schedule' && !draft.schedule && !inherited.schedule
                  ? { notify: v, schedule }
                  : { notify: v },
              )
            }
            options={[
              { value: 'always', label: tr('Always'), detail: tr('Any time they write') },
              {
                value: 'schedule',
                label: tr('In these hours'),
                detail: tr('Held until the hours below'),
              },
              {
                value: 'important_only',
                label: tr('Only if important'),
                detail: tr('Questions, requests, mentions, urgent'),
              },
              {
                value: 'mute',
                label: tr('Never'),
                detail: tr('Still in your inbox, never a sound'),
              },
            ]}
          />
        </View>
        {hours ? (
          <View style={{ gap: 10 }} testID="rule-hours">
            <DayPicker
              label={tr('Days')}
              days={schedule.days}
              onChange={(days) => void save({ schedule: { ...schedule, days } })}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TimeField
                label={tr('From')}
                value={schedule.start}
                onChange={(start) => void save({ schedule: { ...schedule, start } })}
                testID="rule-from"
              />
              <TimeField
                label={tr('Until')}
                value={schedule.end}
                onChange={(end) => void save({ schedule: { ...schedule, end } })}
                testID="rule-until"
              />
            </View>
          </View>
        ) : null}
        <SwitchRow
          label={tr('Urgent messages still reach me')}
          detail={tr('When they mark one urgent, at any hour')}
          value={Boolean(pick('allowUrgent'))}
          onChange={(v) => void save({ allowUrgent: v })}
          testID="rule-urgent"
        />
        <Overline>{tr('In your inbox')}</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<Priority>
            label={tr('Priority')}
            value={priority}
            onChange={(v) => void save({ priority: v })}
            options={[
              {
                value: 'priority',
                label: tr('Priority'),
                detail: tr('Near the top, under Important'),
              },
              { value: 'normal', label: tr('Normal') },
              {
                value: 'quiet',
                label: tr('Quiet'),
                detail: tr('Tucked away unless they ask you something'),
              },
            ]}
          />
        </View>
        {priority === 'priority' ? (
          <SwitchRow
            label={tr('Priority only in these hours')}
            detail={tr('Like a manager during the work week')}
            value={inHoursOnly}
            onChange={(v) =>
              void save(
                v && !draft.schedule && !inherited.schedule
                  ? { priorityInScheduleOnly: v, schedule }
                  : { priorityInScheduleOnly: v },
              )
            }
            testID="rule-priority-hours"
          />
        ) : null}
        <Overline>{tr('Following up')}</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<string>
            label={tr('Remind me when they haven’t answered')}
            value={followUp ? String(followUp) : 'off'}
            onChange={(v) => void save({ followUpHours: v === 'off' ? null : Number(v) })}
            options={
              followUp && !FOLLOW_UPS.some((f) => f.value === String(followUp))
                ? [
                    ...trAll(FOLLOW_UPS),
                    { value: String(followUp), label: tr('After {followUp} hours', { followUp }) },
                  ]
                : trAll(FOLLOW_UPS)
            }
          />
        </View>
        <Overline>{tr('Writing to them')}</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<AiTone>
            label={tr('The tone Caime suggests')}
            value={pick('aiTone') as AiTone}
            onChange={(v) => void save({ aiTone: v })}
            options={[
              { value: 'neutral', label: tr('Neutral') },
              { value: 'friendly', label: tr('Friendly') },
              { value: 'professional', label: tr('Professional') },
            ]}
          />
        </View>
        <Overline>{tr('What they see of you')}</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<PrivacyPreset>
            label={tr('What they see of you')}
            // Only "limited" hides more than the privacy settings do (privacy.ts in core).
            value={pick('privacy') === 'limited' ? 'limited' : 'standard'}
            onChange={(v) => void save({ privacy: v })}
            options={[
              { value: 'standard', label: tr('What your privacy settings allow') },
              {
                value: 'limited',
                label: tr('Limited'),
                detail: tr(
                  'Never when you’re online or were last, your status, about, pronouns or location, nor read receipts',
                ),
              },
            ]}
          />
        </View>
        {!rule ? null : confirming ? (
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <Button
              label={tr('Remove it')}
              variant="danger"
              onPress={() => void remove()}
              style={{ flex: 1 }}
              testID="rule-delete-confirm"
            />
            <Button
              label={tr('Keep it')}
              variant="secondary"
              onPress={() => setConfirming(false)}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(true)}
            style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}
            testID="rule-delete"
          >
            <Text variant="captionStrong" color="danger">
              {deleteLabel ?? tr('Remove this rule')}
            </Text>
          </Pressable>
        )}
        <Text variant="caption" color={t.c.textTertiary}>
          {scope.connectionId
            ? tr('Only for them. Everything it doesn’t change follows how you know them.')
            : tr('For everyone you know this way, unless one of them has a rule of their own.')}
        </Text>
      </View>
    </Sheet>
  );
}
