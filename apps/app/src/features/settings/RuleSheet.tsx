/**
 * One rule (PRD §68–70): how Caishy treats a kind of relationship, a role in it, or one person.
 * Whatever it doesn't set comes from the broader rule it sits under (a role's from its
 * relationship's, one person's from how you know them), and shows as it applies. A named rule is
 * a template ("My Customers"). The rules themselves are the server's (policy.ts in core).
 */
import type { PolicyView } from '@caishy/core/api';
import type {
  AiTone,
  EffectivePolicy,
  NotifyMode,
  PolicySettings,
  Priority,
  PrivacyPreset,
} from '@caishy/core/policy';
import { type Schedule, workHours } from '@caishy/core/time';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { DayPicker } from '@/features/settings/DayPicker';
import { Choice } from '@/features/settings/SettingsPage';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The server's limit on a rule's name. */
const NAME_MAX = 60;

const FOLLOW_UPS: Array<{ value: string; label: string; detail?: string }> = [
  { value: 'off', label: 'Don’t remind me' },
  { value: '24', label: 'After a day', detail: 'If they haven’t answered you by then' },
  { value: '48', label: 'After 2 days' },
  { value: '72', label: 'After 3 days' },
  { value: '168', label: 'After a week' },
];

function Overline({ children }: { children: string }) {
  return (
    <Text variant="overline" color="textTertiary" accessibilityRole="header">
      {children}
    </Text>
  );
}

function Toggle({
  label,
  detail,
  value,
  onChange,
  testID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

/** A 24-hour time, kept only once it is one. */
function TimeInput({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(value), [value]);
  const settle = () => {
    const v = text.trim();
    if (!TIME.test(v)) {
      setError('Use 24-hour time, like 08:30.');
      return;
    }
    setError(null);
    if (v !== value) onChange(v);
  };
  return (
    <TextField
      label={label}
      value={text}
      onChangeText={(v) => {
        setText(v);
        if (TIME.test(v.trim())) setError(null);
      }}
      onBlur={settle}
      onSubmitEditing={settle}
      error={error}
      maxLength={5}
      keyboardType="numbers-and-punctuation"
      style={{ flex: 1 }}
      testID={testID}
    />
  );
}

export function RuleSheet({
  rule,
  inherited,
  title,
  subtitle,
  open,
  onClose,
  deleteLabel,
  onDeleted,
}: {
  rule: PolicyView | null;
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
  // Saved (here or on another device), the rule as it's stored now. Another rule is another
  // sheet: callers key it by the rule's id.
  useEffect(() => {
    setDraft(rule?.settings ?? {});
  }, [rule?.settings]);
  if (!rule) return null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.policies });
    void qc.invalidateQueries({ queryKey: ['policy-for'] });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  };
  const save = async (settings: PolicySettings) => {
    setDraft((d) => ({ ...d, ...settings }));
    try {
      await endpoints.updatePolicy(rule.id, { settings });
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const saveName = async () => {
    const next = name.trim() || null;
    if (next === (rule.name ?? null)) return;
    try {
      await endpoints.updatePolicy(rule.id, { name: next });
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const remove = async () => {
    try {
      await endpoints.deletePolicy(rule.id);
      refresh();
      toast('Rule removed');
      onDeleted?.();
      onClose();
    } catch (e) {
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
        {rule.scope.connectionId ? null : (
          <TextField
            label="Its name (optional)"
            value={name}
            onChangeText={setName}
            onBlur={() => void saveName()}
            onSubmitEditing={() => void saveName()}
            placeholder="My customers"
            maxLength={NAME_MAX}
            testID="rule-name"
          />
        )}
        <Overline>Notifications</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<NotifyMode>
            label="Notifications"
            value={notify}
            onChange={(v) =>
              void save(
                v === 'schedule' && !draft.schedule && !inherited.schedule
                  ? { notify: v, schedule }
                  : { notify: v },
              )
            }
            options={[
              { value: 'always', label: 'Always', detail: 'Any time they write' },
              { value: 'schedule', label: 'In these hours', detail: 'Held until the hours below' },
              {
                value: 'important_only',
                label: 'Only if important',
                detail: 'Questions, requests, mentions, urgent',
              },
              { value: 'mute', label: 'Never', detail: 'Still in your inbox, never a sound' },
            ]}
          />
        </View>
        {hours ? (
          <View style={{ gap: 10 }} testID="rule-hours">
            <DayPicker
              label="Days"
              days={schedule.days}
              onChange={(days) => void save({ schedule: { ...schedule, days } })}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TimeInput
                label="From"
                value={schedule.start}
                onChange={(start) => void save({ schedule: { ...schedule, start } })}
                testID="rule-from"
              />
              <TimeInput
                label="Until"
                value={schedule.end}
                onChange={(end) => void save({ schedule: { ...schedule, end } })}
                testID="rule-until"
              />
            </View>
          </View>
        ) : null}
        <Toggle
          label="Urgent messages still reach me"
          detail="When they mark one urgent, at any hour"
          value={Boolean(pick('allowUrgent'))}
          onChange={(v) => void save({ allowUrgent: v })}
          testID="rule-urgent"
        />
        <Overline>In your inbox</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<Priority>
            label="Priority"
            value={priority}
            onChange={(v) => void save({ priority: v })}
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
        {priority === 'priority' ? (
          <Toggle
            label="Priority only in these hours"
            detail="Like a manager during the work week"
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
        <Overline>Following up</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<string>
            label="Remind me when they haven’t answered"
            value={followUp ? String(followUp) : 'off'}
            onChange={(v) => void save({ followUpHours: v === 'off' ? null : Number(v) })}
            options={
              followUp && !FOLLOW_UPS.some((f) => f.value === String(followUp))
                ? [...FOLLOW_UPS, { value: String(followUp), label: `After ${followUp} hours` }]
                : FOLLOW_UPS
            }
          />
        </View>
        <Overline>Writing to them</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<AiTone>
            label="The tone Caishy suggests"
            value={pick('aiTone') as AiTone}
            onChange={(v) => void save({ aiTone: v })}
            options={[
              { value: 'neutral', label: 'Neutral' },
              { value: 'friendly', label: 'Friendly' },
              { value: 'professional', label: 'Professional' },
            ]}
          />
        </View>
        <Overline>What they see of you</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<PrivacyPreset>
            label="What they see of you"
            // Only "limited" hides more than the privacy settings do (privacy.ts in core).
            value={pick('privacy') === 'limited' ? 'limited' : 'standard'}
            onChange={(v) => void save({ privacy: v })}
            options={[
              { value: 'standard', label: 'What your privacy settings allow' },
              {
                value: 'limited',
                label: 'Limited',
                detail:
                  'Never when you’re online or were last, your status, about, pronouns or location, nor read receipts',
              },
            ]}
          />
        </View>
        {confirming ? (
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <Button
              label="Remove it"
              variant="danger"
              onPress={() => void remove()}
              style={{ flex: 1 }}
              testID="rule-delete-confirm"
            />
            <Button
              label="Keep it"
              variant="secondary"
              onPress={() => setConfirming(false)}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirming(true)}
            style={{ paddingVertical: 10 }}
            testID="rule-delete"
          >
            <Text variant="captionStrong" color="danger">
              {deleteLabel ?? 'Remove this rule'}
            </Text>
          </Pressable>
        )}
        <Text variant="caption" color={t.c.textTertiary}>
          {rule.scope.connectionId
            ? 'Only for them. Everything it doesn’t change follows how you know them.'
            : 'For everyone you know this way, unless one of them has a rule of their own.'}
        </Text>
      </View>
    </Sheet>
  );
}
