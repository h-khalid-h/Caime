/**
 * An organization's intake forms (M16 H5), for its owner and admins on the setup screen: what it
 * asks a customer before a visit or an order (allergies, a car's plate, how many are coming).
 * Its team sends one from a customer's conversation, or one follows a booked item by itself; the
 * customer answers on the card, and an answer kept in one of its customer fields lands in their
 * record. A form already sent keeps its questions as they were.
 */
import type { OrgView } from '@caime/core/api';
import { type CustomerField, FIELD_CHOICES_MAX } from '@caime/core/customers';
import { listed, msg, tr, trn } from '@caime/core/i18n';
import {
  FORM_INTRO_CHARS,
  FORM_NAME_CHARS,
  FORMS_MAX,
  type IntakeForm,
  type IntakeFormInput,
  keptKind,
  QUESTION_CHARS,
  QUESTIONS_MAX,
  type QuestionKind,
} from '@caime/core/intake';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import FileText from 'lucide-react-native/icons/file-text';
import Plus from 'lucide-react-native/icons/plus';
import Trash from 'lucide-react-native/icons/trash';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { putAnswer } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { IconButton } from '@/ui/IconButton';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const KIND_LABELS: Record<QuestionKind, string> = {
  text: msg('Words'),
  longtext: msg('Several lines'),
  number: msg('A number'),
  date: msg('A day'),
  choice: msg('One of a few'),
  yesno: msg('Yes or no'),
};

type QuestionDraft = IntakeFormInput['questions'][number];

/** The fields an answer of this kind can be kept in: the customer fields of its own kind. */
const fieldsFor = (kind: QuestionKind, fields: CustomerField[]) =>
  fields.filter((f) => f.kind === keptKind(kind));

export function OrgForms({ org }: { org: OrgView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.orgForms(org.id), queryFn: () => endpoints.orgForms(org.id) });
  const forms = q.data?.forms ?? [];
  const fields = org.customerFields ?? [];
  // The form being written: its place among the forms, 'new', or null while none is open.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [intro, setIntro] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  // The question being written: its place, or null for a new one.
  const [at, setAt] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<QuestionKind>('text');
  const [choices, setChoices] = useState('');
  const [required, setRequired] = useState(true);
  const [keepAs, setKeepAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!org.customerFields) return null;

  const clearQuestion = () => {
    setAt(null);
    setLabel('');
    setKind('text');
    setChoices('');
    setRequired(true);
    setKeepAs(null);
  };
  const begin = (which: number | 'new') => {
    const form = which === 'new' ? null : forms[which];
    setName(form?.name ?? '');
    setIntro(form?.intro ?? '');
    setQuestions(form ? form.questions.map((x) => ({ ...x })) : []);
    clearQuestion();
    setError(null);
    setEditing(which);
  };
  const pick = (i: number) => {
    const d = questions[i];
    if (!d) return;
    setAt(i);
    setLabel(d.label);
    setKind(d.kind);
    setChoices((d.choices ?? []).join('\n'));
    setRequired(d.required);
    setKeepAs(d.keepAs ?? null);
  };
  // Kept in a choice field, a question asks that field's choices.
  const keptIn = keepAs ? fields.find((f) => f.id === keepAs) : undefined;
  /** The questions with the one being written kept too (null when it can't be yet). */
  const withTyped = (): QuestionDraft[] | null => {
    if (!label.trim()) return questions;
    const list = (keptIn?.choices ?? choices.split('\n'))
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, FIELD_CHOICES_MAX);
    if (kind === 'choice' && list.length === 0) {
      setError(tr('A choice needs its choices.'));
      return null;
    }
    const next: QuestionDraft = {
      id: at === null ? undefined : questions[at]?.id,
      label: label.trim(),
      kind,
      ...(kind === 'choice' ? { choices: list } : {}),
      required,
      keepAs: keptIn && keptIn.kind === keptKind(kind) ? keptIn.id : null,
    };
    return at === null ? [...questions, next] : questions.map((d, i) => (i === at ? next : d));
  };
  const keepQuestion = () => {
    const next = withTyped();
    if (!next) return;
    setQuestions(next);
    setError(null);
    clearQuestion();
  };
  const drop = (i: number) => {
    setQuestions(questions.filter((_, j) => j !== i));
    if (at === i) clearQuestion();
    else if (at !== null && at > i) setAt(at - 1);
  };
  /** Saves every form, this one as written (or without it), in their order. */
  const saveAll = async (next: IntakeFormInput[], said: string) => {
    setBusy(true);
    setError(null);
    try {
      putAnswer(qc, qk.orgForms(org.id), await endpoints.saveOrgForms(org.id, next));
      setEditing(null);
      toast(said);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const asInput = (f: IntakeForm): IntakeFormInput => ({
    id: f.id,
    name: f.name,
    intro: f.intro ?? null,
    questions: f.questions,
  });
  const save = () => {
    const list = withTyped();
    if (!list || editing === null) return;
    if (!name.trim()) return setError(tr('Name it.'));
    if (!list.length) return setError(tr('Ask at least one question.'));
    const form: IntakeFormInput = {
      ...(editing === 'new' ? {} : { id: forms[editing]?.id }),
      name: name.trim(),
      intro: intro.trim() || null,
      questions: list,
    };
    const next =
      editing === 'new'
        ? [...forms.map(asInput), form]
        : forms.map((f, i) => (i === editing ? form : asInput(f)));
    void saveAll(next, tr('Form saved'));
  };
  const remove = () => {
    if (typeof editing !== 'number') return;
    void saveAll(forms.filter((_, i) => i !== editing).map(asInput), tr('Form removed'));
  };
  const keepable = fieldsFor(kind, fields);

  return (
    <>
      <SectionTitle>{tr('Forms')}</SectionTitle>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        {forms.map((f, i) => (
          <ListRow
            key={f.id}
            icon={FileText}
            title={f.name}
            subtitle={trn(f.questions.length, 'One question', '{n} questions')}
            chevron
            onPress={() => begin(i)}
            testID={`org-form-${i}`}
          />
        ))}
        {forms.length < FORMS_MAX ? (
          <ListRow
            icon={Plus}
            title={tr('New form')}
            subtitle={
              forms.length
                ? null
                : tr('What you ask a customer before a visit or an order, answered on a card')
            }
            onPress={() => begin('new')}
            testID="org-form-new"
          />
        ) : null}
      </View>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? tr('New form') : (forms[editing ?? -1]?.name ?? tr('Form'))}
        subtitle={tr('Sent from a customer’s conversation, or by itself after a booking')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              loading={busy}
              onPress={save}
              testID="org-form-save"
            />
            {typeof editing === 'number' ? (
              <Button
                label={tr('Remove this form')}
                variant="ghost"
                block
                disabled={busy}
                onPress={remove}
                testID="org-form-remove"
              />
            ) : null}
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Name')}
            value={name}
            onChangeText={setName}
            maxLength={FORM_NAME_CHARS}
            placeholder={tr('Before your visit')}
            testID="org-form-name"
          />
          <TextField
            label={tr('A line before the questions')}
            value={intro}
            onChangeText={setIntro}
            maxLength={FORM_INTRO_CHARS}
            multiline
            testID="org-form-intro"
          />
          {questions.length ? (
            <View
              style={{
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: t.c.border,
                overflow: 'hidden',
              }}
            >
              {questions.map((d, i) => (
                <ListRow
                  key={d.id ?? `new-${i}`}
                  title={d.label}
                  subtitle={listed([
                    tr(KIND_LABELS[d.kind]),
                    d.required ? tr('Needed') : null,
                    d.keepAs
                      ? tr('Kept as {field}', {
                          field: fields.find((f) => f.id === d.keepAs)?.label ?? '',
                        })
                      : null,
                  ])}
                  selected={at === i}
                  onPress={() => pick(i)}
                  right={
                    <IconButton
                      icon={Trash}
                      label={tr('Remove {field}', { field: d.label })}
                      onPress={() => drop(i)}
                      testID={`org-form-question-remove-${i}`}
                    />
                  }
                  testID={`org-form-question-${i}`}
                />
              ))}
            </View>
          ) : null}
          <TextField
            label={tr('Question')}
            value={label}
            onChangeText={setLabel}
            maxLength={QUESTION_CHARS}
            placeholder={tr('Any allergies?')}
            testID="org-form-question-label"
          />
          <ChoiceChips<QuestionKind>
            label={tr('Answered with')}
            value={kind}
            onChange={(k) => {
              setKind(k);
              // A field of another kind can't keep it.
              if (keptIn && keptIn.kind !== keptKind(k)) setKeepAs(null);
            }}
            wrap
            options={(Object.keys(KIND_LABELS) as QuestionKind[]).map((k) => ({
              value: k,
              label: tr(KIND_LABELS[k]),
              testID: `org-form-kind-${k}`,
            }))}
          />
          {kind === 'choice' && !keptIn ? (
            <TextField
              label={tr('Its choices, one a line')}
              value={choices}
              onChangeText={setChoices}
              multiline
              testID="org-form-choices"
            />
          ) : null}
          {kind === 'choice' && keptIn?.choices ? (
            <Text variant="caption" color="textSecondary">
              {tr('Its choices are the field’s: {choices}', {
                choices: listed(keptIn.choices),
              })}
            </Text>
          ) : null}
          <SwitchRow
            label={tr('Needed')}
            detail={tr('The form isn’t sent without an answer to it')}
            value={required}
            onChange={setRequired}
            testID="org-form-required"
          />
          {keepable.length ? (
            <ChoiceSheet<string>
              label={tr('Keep the answer in')}
              value={keptIn ? keptIn.id : 'none'}
              onChange={(v) => setKeepAs(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: tr('Only on the card') },
                ...keepable.map((f) => ({ value: f.id, label: f.label })),
              ]}
              detail={tr('A customer field, in their record')}
              testID="org-form-keep"
            />
          ) : null}
          <Button
            label={at === null ? tr('Add it') : tr('Done')}
            variant="secondary"
            disabled={!label.trim() || (at === null && questions.length >= QUESTIONS_MAX)}
            onPress={keepQuestion}
            testID="org-form-question-keep"
          />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
