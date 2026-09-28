import type { SuggestionView } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { formatDue } from '@caime/core/format';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSuggestions } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Calendar, Sparkles } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const ACCEPT_LABEL: Record<string, string> = {
  task: 'Add to actions',
  reminder: 'Remind me',
  waiting: 'Track it',
  decision: 'Save decision',
  topic: 'Start a topic',
  relationship: 'Add label',
};

const DONE: Record<string, string> = {
  task: 'Added to your actions',
  reminder: 'Reminder set',
  waiting: 'You’ll see it under Waiting',
  decision: 'Decision saved',
  topic: 'Topic started',
  relationship: 'Label added. Only you see it.',
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
  const list = (q.data?.suggestions ?? []).filter((s) => s.conversationId === conversationId);
  const s: SuggestionView | undefined = list[0];
  if (!s) return null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['suggestions'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: qk.memory(conversationId) });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  };
  const accept = async () => {
    setBusy(true);
    try {
      const { accepted } = await endpoints.acceptSuggestion(s.id);
      toast(DONE[s.kind] ?? 'Done');
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
  const dismiss = async () => {
    qc.setQueryData(
      qk.suggestions(conversationId),
      (d: { suggestions: SuggestionView[] } | undefined) =>
        d ? { suggestions: d.suggestions.filter((x) => x.id !== s.id) } : d,
    );
    await endpoints.dismissSuggestion(s.id).catch(() => {});
    refresh();
  };
  return (
    <View
      accessibilityLabel={`Suggestion: ${s.title}`}
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 12,
        borderRadius: 16,
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c.border,
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Sparkles size={14} color={t.c.accentStrong} />
        <Text variant="overline" color="accentStrong" style={{ flex: 1 }}>
          {s.payload.source === 'ai' ? AI_LABEL : 'Suggestion'}
          {list.length > 1 ? ` · 1 of ${list.length}` : ''}
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
      {s.rationale ? (
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {s.rationale}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={ACCEPT_LABEL[s.kind] ?? 'Yes'} size="sm" onPress={accept} loading={busy} />
        <Button label="Not now" size="sm" variant="ghost" onPress={dismiss} />
      </View>
    </View>
  );
}
