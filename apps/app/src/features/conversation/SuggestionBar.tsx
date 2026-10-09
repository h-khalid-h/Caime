import type { SuggestionView } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { formatDue } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
import { learnedOf, placeByLean } from '@caime/core/learning';
import { surenessLine } from '@caime/core/sureness';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Calendar from 'lucide-react-native/icons/calendar';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSuggestions } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { lifted } from '@/ui/shadow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const ACCEPT_LABEL: Record<string, string> = {
  task: msg('Add to actions'),
  reminder: msg('Remind me'),
  waiting: msg('Track it'),
  decision: msg('Save decision'),
  topic: msg('Start a topic'),
  relationship: msg('Add label'),
};

const DONE: Record<string, string> = {
  task: msg('Added to your actions'),
  reminder: msg('Reminder set'),
  waiting: msg('You’ll see it under Waiting'),
  decision: msg('Decision saved'),
  topic: msg('Topic started'),
  relationship: msg('Label added. Only you see it.'),
};

/**
 * Caime's suggestions for this conversation, one at a time. They're offers, never facts (R12):
 * nothing happens until the person says yes, and "Not now" is always there.
 */
export function SuggestionBar({ conversationId }: { conversationId: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useSuggestions(conversationId);
  const [busy, setBusy] = useState(false);
  const { timeZone, locale } = useUserClock();
  const here = (q.data?.suggestions ?? []).filter((s) => s.conversationId === conversationId);
  // What this person keeps taking comes first; what they keep passing on waits in one line,
  // never hidden, until they ask for it (M11).
  const [showQuiet, setShowQuiet] = useState(false);
  const placed = placeByLean(here);
  const list = showQuiet ? [...placed.shown, ...placed.quiet] : placed.shown;
  // Several found here (R37): offered as one card, done on one approval, until they choose to
  // take them one at a time.
  const [oneAtATime, setOneAtATime] = useState(false);
  const s: SuggestionView | undefined = list[0];
  const quietLine =
    placed.quiet.length && !showQuiet ? (
      <Pressable
        onPress={() => setShowQuiet(true)}
        accessibilityRole="button"
        style={{ marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        testID="suggestions-quiet"
      >
        <Text variant="caption" color="textSecondary">
          {trn(
            placed.quiet.length,
            '{n} quieter suggestion you usually pass on · Show',
            '{n} quieter suggestions you usually pass on · Show',
          )}
        </Text>
      </Pressable>
    ) : null;
  if (!s) return quietLine;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.allSuggestions });
    void qc.invalidateQueries({ queryKey: qk.allTasks });
    void qc.invalidateQueries({ queryKey: qk.memory(conversationId) });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  };
  const accept = async () => {
    setBusy(true);
    try {
      const { accepted } = await endpoints.acceptSuggestion(s.id);
      toast(tr(DONE[s.kind] ?? msg('Done')));
      // A topic started is opened, as one started from the details is.
      if (accepted.type === 'conversation') {
        void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
        router.navigate({ pathname: '/c/[id]', params: { id: accepted.id } });
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
      refresh();
    }
  };
  /** Every step of the card, in order; what was done can be taken back from the toast. */
  const doAll = async () => {
    setBusy(true);
    const ids = list.map((x) => x.id);
    try {
      const { results } = await endpoints.acceptSuggestions(ids);
      const done = results.filter((r) => r.accepted);
      const failed = results.find((r) => r.error);
      const undoable = done.filter((r) => r.accepted?.type === 'task').map((r) => r.id);
      const kept = done.length - undoable.length;
      if (done.length)
        toast(tr('{length} done', { length: done.length }), {
          action: {
            label: tr('Undo'),
            onPress: () => {
              void Promise.all(undoable.map((id) => endpoints.undoSuggestion(id).catch(() => {})))
                .then(() => {
                  toast(
                    kept
                      ? tr('{length} undone; {a}', {
                          length: undoable.length,
                          a: trn(kept, 'a decision stays', '{n} decisions stay'),
                        })
                      : tr('Undone'),
                  );
                })
                .finally(refresh);
            },
          },
        });
      if (failed) toast(failed.error ?? tr('One step couldn’t be done.'), { tone: 'danger' });
      const opened = done.find((r) => r.accepted?.type === 'conversation');
      if (opened?.accepted)
        router.navigate({ pathname: '/c/[id]', params: { id: opened.accepted.id } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const dismissAll = async () => {
    const ids = new Set(list.map((x) => x.id));
    qc.setQueryData(
      qk.suggestions(conversationId),
      (d: { suggestions: SuggestionView[] } | undefined) =>
        d ? { suggestions: d.suggestions.filter((x) => !ids.has(x.id)) } : d,
    );
    await Promise.all(list.map((x) => endpoints.dismissSuggestion(x.id).catch(() => {})));
    refresh();
  };
  const label = list.some((x) => x.payload.source === 'ai') ? tr(AI_LABEL) : tr('Suggestions');
  if (list.length > 1 && !oneAtATime)
    return (
      <>
        <View
          accessibilityLabel={tr('Suggestions: {length} things here', { length: list.length })}
          testID="suggestions-card"
          style={{
            marginHorizontal: 12,
            marginBottom: 8,
            padding: 12,
            borderRadius: 16,
            backgroundColor: t.c.surface,
            borderWidth: 1,
            borderColor: t.c.border,
            gap: 8,
            ...lifted(t.c.shadow, 3, 10),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color={t.c.accentStrong} />
            <Text variant="overline" color="accentStrong" style={{ flex: 1 }}>
              {tr('{label} · {count}', {
                label,
                count: trn(list.length, '{n} thing here', '{n} things here'),
              })}
            </Text>
          </View>
          {list.map((x) => (
            <View
              key={x.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              testID={`suggestion-step-${x.kind}`}
            >
              <Text variant="captionStrong" color="textSecondary">
                {tr(ACCEPT_LABEL[x.kind] ?? msg('Yes'))}:
              </Text>
              <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                {x.title}
              </Text>
              {x.dueAt ? (
                <Text variant="captionStrong" color="textSecondary">
                  {formatDue(x.dueAt, new Date(), timeZone, locale, Boolean(x.payload.dueHasTime))}
                </Text>
              ) : null}
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            {tr('Nothing happens until you say so; each step can be taken back after.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              label={tr('Do all {length}', { length: list.length })}
              size="sm"
              onPress={doAll}
              loading={busy}
              testID="suggestions-all"
            />
            <Button
              label={tr('One at a time')}
              size="sm"
              variant="secondary"
              onPress={() => setOneAtATime(true)}
              testID="suggestions-one"
            />
            <Button
              label={tr('Not now')}
              size="sm"
              variant="ghost"
              onPress={dismissAll}
              testID="suggestions-dismiss-all"
            />
          </View>
        </View>
        {quietLine}
      </>
    );
  const dismiss = async () => {
    qc.setQueryData(
      qk.suggestions(conversationId),
      (d: { suggestions: SuggestionView[] } | undefined) =>
        d ? { suggestions: d.suggestions.filter((x) => x.id !== s.id) } : d,
    );
    await endpoints.dismissSuggestion(s.id).catch(() => {});
    refresh();
  };
  const oneLabel = s.payload.source === 'ai' ? tr(AI_LABEL) : tr('Suggestion');
  return (
    <>
      <View
        accessibilityLabel={tr('Suggestion: {title}', { title: s.title })}
        style={{
          marginHorizontal: 12,
          marginBottom: 8,
          padding: 12,
          borderRadius: 16,
          backgroundColor: t.c.surface,
          borderWidth: 1,
          borderColor: t.c.border,
          gap: 8,
          ...lifted(t.c.shadow, 3, 10),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} color={t.c.accentStrong} />
          <Text variant="overline" color="accentStrong" style={{ flex: 1 }}>
            {list.length > 1
              ? tr('{label} · 1 of {length}', { label: oneLabel, length: list.length })
              : oneLabel}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text variant="bodyStrong">{s.title}</Text>
          {s.dueAt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Calendar size={13} color={t.c.textSecondary} />
              <Text variant="captionStrong" color="textSecondary">
                {formatDue(s.dueAt, new Date(), timeZone, locale, Boolean(s.payload.dueHasTime))}
              </Text>
            </View>
          ) : null}
        </View>
        {/* How sure, then why, in one line (M11): a dated promise is sure, a hint a guess. */}
        <Text variant="caption" color="textSecondary" numberOfLines={2} testID="suggestion-sure">
          {surenessLine(s.confidence, s.rationale)}
        </Text>
        {learnedLine(s)}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={tr(ACCEPT_LABEL[s.kind] ?? msg('Yes'))}
            size="sm"
            onPress={accept}
            loading={busy}
          />
          <Button label={tr('Not now')} size="sm" variant="ghost" onPress={dismiss} />
        </View>
      </View>
      {quietLine}
    </>
  );
}

/** What this person's own choices taught about this kind, said with the count (M11). */
function learnedLine(s: SuggestionView) {
  const l = learnedOf(s.payload);
  if (!l) return null;
  const of = l.accepted + l.dismissed;
  return (
    <Text variant="caption" color="textSecondary" testID="suggestion-learned">
      {l.lean === 'favoured'
        ? tr('You took {accepted} of the last {of} like this', { accepted: l.accepted, of })
        : tr('You passed on {dismissed} of the last {of} like this', {
            dismissed: l.dismissed,
            of,
          })}
    </Text>
  );
}
