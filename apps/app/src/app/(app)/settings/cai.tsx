/**
 * Settings · Cai (R68): everything Cai does for you between your messages to it, and everything
 * it has learned, in one place, each with a way to stop it or forget it. Nothing here is shown to
 * anyone else, and Cai never acts in your name without your tap.
 */
import type { CaiLearnedView } from '@caime/core/api';
import {
  ARABIC_VARIETIES,
  type ArabicVariety,
  type ArabicVarietyChoice,
  varietyOfCountry,
} from '@caime/core/arabic-variety';
import { formatWhen } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
import { INITIATIVE_CHOICES, type Initiative } from '@caime/core/initiative';
import type { SuggestionKind } from '@caime/core/intelligence';
import { CAI_ID } from '@caime/core/system-ids';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openDirectWith } from '@/features/inbox/openChat';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { useLanguage } from '@/lib/languageState';
import { useNow, useUserClock } from '@/lib/time';
import { putAnswer } from '@/state/cache';
import { useMe } from '@/state/session';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { ListRow } from '@/ui/ListRow';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TimeField } from '@/ui/TimeField';
import { toast } from '@/ui/Toast';

const BRIEF_AT = '08:00';

/** Each kind of suggestion as Settings · Cai names it, beside what was learned of it (R68). */
const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  task: msg('Things to do'),
  reminder: msg('Reminders'),
  waiting: msg('What you wait for'),
  decision: msg('Decisions'),
  topic: msg('Topics'),
  relationship: msg('How you know someone'),
  duplicate: msg('Possible duplicates'),
  context: msg('What conversations are about'),
  done: msg('What arrived'),
};

/** Each Arabic Cai and the Caime Friends can speak (R72), as the setting names it. */
const VARIETY_LABELS: Record<ArabicVariety, string> = {
  standard: msg('Standard Arabic'),
  egyptian: msg('Egyptian Arabic'),
  gulf: msg('Gulf Arabic'),
  levantine: msg('Levantine Arabic'),
  iraqi: msg('Iraqi Arabic'),
  maghrebi: msg('Maghrebi Arabic'),
  sudanese: msg('Sudanese Arabic'),
  yemeni: msg('Yemeni Arabic'),
};

/**
 * How much Cai does unasked (R66): what it suggests on its own, whether it asks about a quiet
 * wait and how soon, and whether it tells you before a meeting. What you ask of it is never
 * held back.
 */
function CaiInitiative() {
  const choice = usePrefs((s) => s.caiInitiative);
  return (
    <Group
      title={tr('What Cai does unasked')}
      footer={tr('What you ask Cai for is never held back.')}
    >
      <ChoiceSheet
        label={tr('Cai on its own')}
        value={choice}
        onChange={(next: Initiative) => savePrefs({ caiInitiative: next })}
        options={INITIATIVE_CHOICES.map((c) => ({
          value: c.value,
          label: tr(c.label),
          detail: tr(c.detail),
        }))}
        testID="cai-initiative"
      />
    </Group>
  );
}

/**
 * How Cai and the Caime Friends speak Arabic with you (R72): as you write it, else as where you
 * live, or one you choose. Offered to whoever reads Caime in Arabic, lives where it's spoken or
 * chose one already; the interface itself stays in Standard Arabic.
 */
function CaiArabic() {
  const me = useMe();
  const shown = useLanguage((s) => s.language);
  const choice = usePrefs((s) => s.arabicVariety);
  const home = varietyOfCountry(me.country) ?? 'standard';
  if (shown !== 'ar' && home === 'standard' && choice === 'auto') return null;
  const choose = (next: ArabicVarietyChoice) => savePrefs({ arabicVariety: next });
  return (
    <Group
      title={tr('How Cai speaks Arabic')}
      footer={tr(
        'Cai and the Caime Friends answer in Arabic as you speak it: the Arabic you write in, else the one where you live. Caime’s own screens stay in Standard Arabic.',
      )}
    >
      <ChoiceSheet
        label={tr('Cai’s Arabic')}
        value={choice}
        onChange={choose}
        shown={
          choice === 'auto'
            ? tr('As you write it, else {variety}', { variety: tr(VARIETY_LABELS[home]) })
            : undefined
        }
        options={[
          {
            value: 'auto',
            label: tr('As you write it'),
            detail: tr('Else as where you live: {variety}', {
              variety: tr(VARIETY_LABELS[home]),
            }),
          },
          ...ARABIC_VARIETIES.map((v) => ({ value: v, label: tr(VARIETY_LABELS[v]) })),
        ]}
        testID="cai-arabic"
      />
    </Group>
  );
}

/** What a lean means for the suggestions of that kind, in words. */
function leanWords(l: CaiLearnedView): string {
  if (l.lean === 'favoured') return tr('Offered first');
  if (l.lean === 'quiet') return tr('Set apart');
  return tr('Still learning');
}

export default function CaiSettings() {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const brief = usePrefs((s) => s.caiBrief);
  const digest = usePrefs((s) => s.caiDigest);
  const learnFromChoices = usePrefs((s) => s.learnFromChoices);
  const q = useQuery({ queryKey: qk.cai, queryFn: endpoints.cai });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await work();
      toast(done);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const forget = (kind?: CaiLearnedView['kind']) =>
    run(
      kind ?? 'all',
      async () => putAnswer(qc, qk.cai, await endpoints.caiForget(kind)),
      tr('Forgotten.'),
    );
  const stop = (taskId: string) =>
    run(
      taskId,
      async () => {
        await endpoints.updateTask(taskId, { caiFollowUp: false });
        await qc.invalidateQueries({ queryKey: qk.cai });
        void qc.invalidateQueries({ queryKey: qk.allTasks });
      },
      tr('Cai won’t follow that up.'),
    );
  const data = q.data;
  const row = { borderTopWidth: 1, borderTopColor: t.c.border } as const;

  return (
    <SettingsPage title={tr('Cai')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar id={CAI_ID} name="Cai" size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{tr('Cai')}</Text>
          <Text variant="caption" color="textSecondary">
            {tr('Cai never acts in your name without your tap, and shows nobody what it knows.')}
          </Text>
        </View>
        <Button
          label={tr('Chat')}
          size="sm"
          variant="secondary"
          onPress={() => void openDirectWith(CAI_ID)}
          testID="cai-chat"
        />
      </View>

      <CaiArabic />

      <CaiInitiative />

      <Group
        title={tr('Morning brief')}
        footer={tr(
          'Once a day, in Cai’s chat: what’s on today and what’s open. Worked out by the rules, at no cost.',
        )}
      >
        <SwitchRow
          inset
          label={tr('Brief me every morning')}
          value={brief !== null}
          onChange={(on) => savePrefs({ caiBrief: on ? BRIEF_AT : null })}
          testID="cai-brief"
        />
        {brief ? (
          <View style={[{ paddingHorizontal: 16, paddingBottom: 16 }]}>
            <TimeField
              label={tr('At')}
              value={brief}
              onChange={(at) => savePrefs({ caiBrief: at })}
              testID="cai-brief-at"
            />
          </View>
        ) : null}
      </Group>

      <Group
        title={tr('Your week')}
        footer={tr(
          'At the start of your week, in Cai’s chat: who you talked with, who has gone quiet, what you’ve waited on longest and what’s ahead. At the brief’s hour, or nine. Worked out by the rules, at no cost.',
        )}
      >
        <SwitchRow
          inset
          label={tr('Look over my week with me')}
          value={digest}
          onChange={(on) => savePrefs({ caiDigest: on })}
          testID="cai-digest"
        />
      </Group>

      <Group
        title={tr('Follow-ups Cai keeps')}
        footer={tr(
          'Say “Still waiting” on Attention, and Cai comes back with a follow-up ready to send. It sends nothing until you tap.',
        )}
      >
        {data?.followUps.length ? (
          data.followUps.map((f, i) => (
            <ListRow
              key={f.taskId}
              title={`${f.who} · ${f.title}`}
              subtitle={
                f.at
                  ? tr('Next {when}', { when: formatWhen(f.at, now, timeZone, locale) })
                  : tr('Offered in Cai’s chat')
              }
              right={
                <Button
                  label={tr('Stop')}
                  size="sm"
                  variant="ghost"
                  loading={busy === f.taskId}
                  onPress={() => void stop(f.taskId)}
                />
              }
              style={i ? row : undefined}
              testID="cai-follow-up"
            />
          ))
        ) : (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            {q.isPending ? ' ' : tr('Nothing yet.')}
          </Text>
        )}
      </Group>

      <Group
        title={tr('What Cai has learned')}
        footer={tr(
          'A kind of suggestion you keep taking is offered first; one you keep passing on is set apart, with the count beside it. Nothing is hidden, and it says why. Off keeps every suggestion the same.',
        )}
      >
        <SwitchRow
          inset
          label={tr('Learn from what I accept')}
          value={learnFromChoices}
          onChange={(v) => savePrefs({ learnFromChoices: v })}
          testID="learn-from-choices"
        />
        {data?.learned.map((l) => (
          <ListRow
            key={l.kind}
            title={tr(SUGGESTION_KIND_LABELS[l.kind])}
            subtitle={`${leanWords(l)} · ${trn(l.accepted, '{n} taken', '{n} taken')} · ${trn(l.dismissed, '{n} passed on', '{n} passed on')}`}
            right={
              <Button
                label={tr('Forget')}
                size="sm"
                variant="ghost"
                loading={busy === l.kind}
                onPress={() => void forget(l.kind)}
              />
            }
            style={row}
            testID={`cai-learned-${l.kind}`}
          />
        ))}
        {data?.learned.length ? (
          <ListRow
            title={tr('Forget everything Cai has learned')}
            onPress={() => void forget()}
            style={row}
            testID="cai-forget-all"
          />
        ) : null}
      </Group>
    </SettingsPage>
  );
}
