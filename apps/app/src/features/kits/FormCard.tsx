/**
 * An organization's intake form as a card in a customer's conversation (M16 H5): its name, the
 * line before its questions, and where it stands. The customer it was sent to fills it in on a
 * sheet, each answer checked as the server checks it (core `checkAnswers`); once answered, both
 * sides read the answers on the card. The team waits for them; nobody else answers.
 */
import type { BusinessThreadView, MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import {
  type IntakeQuestion,
  LONG_ANSWER_CHARS,
  NO,
  SHORT_ANSWER_CHARS,
  YES,
} from '@caime/core/intake';
import { checkAnswers, formOf } from '@caime/core/intake-answers';
import { kitStateLabel, kitStateTone } from '@caime/core/kit-states';
import { useQueryClient } from '@tanstack/react-query';
import FileText from 'lucide-react-native/icons/file-text';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip, ChoiceChips } from '@/ui/Chip';
import { DateField } from '@/ui/DateField';
import { formatDay } from '@/ui/dates';
import { Sheet } from '@/ui/Sheet';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const TONE = { positive: 'success', negative: 'danger', neutral: 'neutral' } as const;

/** An answer as the card shows it: a day in the reader's way, yes or no in their language. */
function shownAnswer(q: IntakeQuestion, answer: string, locale: string): string {
  if (q.kind === 'yesno') return answer === YES ? tr('Yes') : tr('No');
  if (q.kind === 'date') return formatDay(answer, locale);
  return answer;
}

export function FormCard({
  m,
  thread,
}: {
  m: MessageView;
  /** The team's thread here; null for the customer; undefined while it isn't known. */
  thread: BusinessThreadView | null | undefined;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const { locale } = useUserClock();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<{ error: string; questionId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const card = formOf(m.payload);
  if (!card) return null;
  const { form, answers } = card;
  const state = (m.payload as { state?: string }).state ?? 'sent';
  const answerable = thread === null && state === 'sent' && !m.deletedAt;

  const set = (id: string, value: string) => {
    setDraft((d) => ({ ...d, [id]: value }));
    if (problem?.questionId === id) setProblem(null);
  };
  const send = async () => {
    const checked = checkAnswers(form, draft);
    if ('error' in checked) {
      setProblem(checked);
      return;
    }
    setBusy(true);
    try {
      upsertMessage(qc, (await endpoints.answerForm(m.id, checked.answers)).message);
      setOpen(false);
      toast(tr('Your answers were sent.'));
    } catch (e) {
      setProblem({ error: (e as Error).message, questionId: null });
    } finally {
      setBusy(false);
    }
  };

  const field = (q: IntakeQuestion) => {
    const value = draft[q.id] ?? '';
    const label = q.required ? q.label : tr('{question} (if you like)', { question: q.label });
    const error = problem?.questionId === q.id ? problem.error : null;
    const testID = `form-answer-${q.id}`;
    if (q.kind === 'date')
      return (
        <DateField
          label={label}
          value={value || null}
          onChange={(day) => set(q.id, day ?? '')}
          error={error}
          testID={testID}
        />
      );
    if (q.kind === 'choice' || q.kind === 'yesno')
      return (
        <View style={{ gap: 4 }}>
          <ChoiceChips<string>
            label={label}
            value={value || null}
            onChange={(v) => set(q.id, v)}
            wrap
            options={(q.kind === 'yesno'
              ? [
                  { value: YES, label: tr('Yes') },
                  { value: NO, label: tr('No') },
                ]
              : (q.choices ?? []).map((c) => ({ value: c, label: c }))
            ).map((o) => ({ ...o, testID: `${testID}-${o.value}` }))}
          />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      );
    return (
      <TextField
        label={label}
        value={value}
        onChangeText={(v) => set(q.id, v)}
        multiline={q.kind === 'longtext'}
        keyboardType={q.kind === 'number' ? 'decimal-pad' : undefined}
        maxLength={q.kind === 'longtext' ? LONG_ANSWER_CHARS : SHORT_ANSWER_CHARS}
        error={error ?? undefined}
        testID={testID}
      />
    );
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID="kit-form">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FileText size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {tr('Form')}
        </Text>
        <Chip label={tr(kitStateLabel(state))} tone={TONE[kitStateTone(state)]} size="sm" />
      </View>
      <Text variant="bodyStrong" auto>
        {form.name}
      </Text>
      {form.intro ? (
        <Text variant="caption" color="textSecondary" auto>
          {form.intro}
        </Text>
      ) : null}
      {answers ? (
        <Spec
          dense
          rows={form.questions
            .filter((q) => answers[q.id] !== undefined)
            .map((q) => ({
              label: q.label,
              value: shownAnswer(q, answers[q.id] as string, locale),
              testID: `form-answered-${q.id}`,
            }))}
          testID="form-answers"
        />
      ) : answerable ? (
        <Button
          label={tr('Fill in')}
          size="sm"
          onPress={() => {
            setProblem(null);
            setOpen(true);
          }}
          testID="form-fill-in"
        />
      ) : state === 'sent' && thread ? (
        <Text variant="caption" color="textTertiary">
          {tr('Waiting for the answers')}
        </Text>
      ) : null}
      {answerable ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={form.name}
          subtitle={form.intro ?? undefined}
          footer={
            <Button
              label={tr('Send answers')}
              block
              size="lg"
              loading={busy}
              onPress={() => void send()}
              testID="form-send"
            />
          }
        >
          <View style={{ gap: 14 }}>
            {form.questions.map((q) => (
              <View key={q.id}>{field(q)}</View>
            ))}
            {problem && !problem.questionId ? (
              <Text variant="caption" color="danger">
                {problem.error}
              </Text>
            ) : null}
            <Text variant="caption" color="textTertiary">
              {tr('Your answers go to the organization alone, on this card.')}
            </Text>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
