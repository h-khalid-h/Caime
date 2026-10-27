/**
 * Settings · Cai's "Answering for you" (R116, M17 I16a, I16a2): people not connected with them,
 * and the people they know by the ways they pick; when (a wait unanswered, while they're busy);
 * whose talks are on their own allowance, up to a number in thirty days; and whom Cai lets them
 * know of at once when it can't wait. One preference (`caiAnswers`), read and saved whole through
 * core `caiAnswersOf`, so whom Cai covers or rings through for is always among whom it answers.
 */
import {
  type CaiAnswersSettings as Answers,
  CAI_ANSWER_AFTER,
  CAI_COVER_CHOICES,
  caiAnswersOf,
} from '@caime/core/cai-answers';
import { listed, tr, trn } from '@caime/core/i18n';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { usePrefs } from '@/theme/prefs';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SpherePicker } from '@/ui/SpherePicker';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';

/** The ways someone may pick, as they know people (never "other", which says nothing). */
const PICKABLE = SPHERES.filter((s) => s !== 'other');

/** The ways picked, as a line: the kinds of people, by name. */
const said = (spheres: Sphere[]) => listed(spheres.map((s) => tr(SPHERE_DEFS[s].plural)));

/** A wait before Cai answers, as the setting says it. */
const afterLabel = (minutes: number) =>
  minutes < 60
    ? trn(minutes, 'After a minute', 'After {n} minutes')
    : trn(minutes / 60, 'After an hour', 'After {n} hours');

type Picking = 'who' | 'covers' | 'ring' | null;

export function CaiAnswersSettings() {
  const stored = usePrefs((s) => s.caiAnswers);
  const now = caiAnswersOf({ caiAnswers: stored });
  const [picking, setPicking] = useState<Picking>(null);
  const save = (next: Partial<Answers>) =>
    savePrefs({ caiAnswers: caiAnswersOf({ caiAnswers: { ...now, ...next } }) });
  return (
    <>
      <Group
        title={tr('Answering for you')}
        footer={tr(
          'When someone you’re not connected with writes to you first, Cai says it’s answering for you. They leave their message, or talk to Cai on their own AI allowance. Cai says only what anyone may see of you and what you offer to everyone, never agrees to anything for you, and tells you here what they wanted. Your own reply ends it. It needs AI assist on.',
        )}
      >
        <SwitchRow
          inset
          label={tr('Cai answers people you don’t know yet')}
          value={now.strangers}
          onChange={(on) => save({ strangers: on })}
          testID="cai-answers"
        />
      </Group>

      <Group
        title={tr('People you know')}
        footer={tr(
          'Cai answers the people you pick, by how you know them, once you haven’t answered in a while or while you’re busy. A talk with Cai is on their own AI allowance, or on yours for the people you cover, up to the number you set in thirty days. How you know them is never said.',
        )}
      >
        <ListRow
          title={tr('Who Cai answers')}
          subtitle={now.spheres.length ? said(now.spheres) : tr('Nobody you know')}
          chevron
          onPress={() => setPicking('who')}
          testID="cai-answers-who"
        />
        {now.spheres.length ? (
          <>
            <ChoiceSheet<string>
              label={tr('When you haven’t answered')}
              value={String(now.after ?? 0)}
              onChange={(minutes) => save({ after: Number(minutes) || null })}
              options={[
                { value: '0', label: tr('Not after a wait') },
                ...CAI_ANSWER_AFTER.map((m) => ({ value: String(m), label: afterLabel(m) })),
              ]}
              testID="cai-answers-after"
            />
            <SwitchRow
              inset
              divider
              label={tr('At once while you’re busy')}
              value={now.whileBusy}
              onChange={(on) => save({ whileBusy: on })}
              testID="cai-answers-busy"
            />
            <ListRow
              title={tr('Talks you cover')}
              subtitle={
                now.covers.length
                  ? tr('{who}, up to {count} in thirty days', {
                      who: said(now.covers),
                      count: now.coverMonthly,
                    })
                  : tr('Nobody: each talks on their own allowance')
              }
              chevron
              onPress={() => setPicking('covers')}
              testID="cai-answers-covers"
            />
            <ListRow
              title={tr('Told at once when it can’t wait')}
              subtitle={now.ringThrough.length ? said(now.ringThrough) : tr('Nobody')}
              chevron
              onPress={() => setPicking('ring')}
              testID="cai-answers-ring"
            />
          </>
        ) : null}
      </Group>

      {picking === 'who' ? (
        <SpheresSheet
          title={tr('Who Cai answers')}
          subtitle={tr('By how you know them')}
          spheres={PICKABLE}
          value={now.spheres}
          onClose={() => setPicking(null)}
          onSave={(spheres) => {
            save({ spheres, ...(now.after === null && !now.whileBusy ? { after: 30 } : {}) });
            setPicking(null);
          }}
          testID="cai-answers-who"
        />
      ) : picking === 'covers' ? (
        <SpheresSheet
          title={tr('Talks you cover')}
          subtitle={tr('On your AI allowance, never theirs')}
          spheres={now.spheres}
          value={now.covers}
          onClose={() => setPicking(null)}
          onSave={(covers, monthly) => {
            save({ covers, coverMonthly: monthly ?? now.coverMonthly });
            setPicking(null);
          }}
          monthly={now.coverMonthly}
          testID="cai-answers-covers"
        />
      ) : picking === 'ring' ? (
        <SpheresSheet
          title={tr('Told at once when it can’t wait')}
          subtitle={tr('Only when they say it can’t wait for you')}
          spheres={now.spheres}
          value={now.ringThrough}
          onClose={() => setPicking(null)}
          onSave={(ringThrough) => {
            save({ ringThrough });
            setPicking(null);
          }}
          testID="cai-answers-ring"
        />
      ) : null}
    </>
  );
}

/** Some of the ways someone knows people, picked in a sheet; with the covered talks' number. */
function SpheresSheet({
  title,
  subtitle,
  spheres,
  value,
  monthly,
  onClose,
  onSave,
  testID,
}: {
  title: string;
  subtitle: string;
  spheres: Sphere[];
  value: Sphere[];
  monthly?: number;
  onClose: () => void;
  onSave: (spheres: Sphere[], monthly?: number) => void;
  testID: string;
}) {
  const [picked, setPicked] = useState<Sphere[]>(value);
  const [count, setCount] = useState(monthly ?? CAI_COVER_CHOICES[2]);
  const label = (children: ReactNode) => (
    <Text variant="overline" color="textTertiary" accessibilityRole="header">
      {children}
    </Text>
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <Button
          label={tr('Save')}
          size="lg"
          block
          onPress={() => onSave(picked, monthly === undefined ? undefined : count)}
          testID={`${testID}-save`}
        />
      }
    >
      <View style={{ gap: 12 }}>
        <SpherePicker
          multiple
          plural
          wrap
          flush
          label={title}
          spheres={spheres}
          value={picked}
          onChange={setPicked}
          testID={`${testID}-pick`}
        />
        {monthly !== undefined ? (
          <>
            {label(tr('In thirty days, at most'))}
            <ChoiceChips<string>
              wrap
              flush
              label={tr('In thirty days, at most')}
              value={String(count)}
              onChange={(n) => setCount(Number(n))}
              options={CAI_COVER_CHOICES.map((n) => ({
                value: String(n),
                label: trn(n, '{n} talk', '{n} talks'),
              }))}
              testID={`${testID}-monthly`}
            />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
