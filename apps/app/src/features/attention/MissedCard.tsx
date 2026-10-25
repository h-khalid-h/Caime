/**
 * What you missed (M17 I3, R66), at the top of Attention while any Needs-you conversation has
 * something new: each conversation with what the rules read in its new messages (asked of you,
 * promised, decided, coming up), a tap opening it at that line; and, with AI assist on, "Sum it
 * up" asks the model once for a summary that cites its lines, each a tap to the message.
 * Loaded apart (`lazyPart`), asked for when Attention shows it and again with the inbox's
 * events (a message, a read, a conversation put aside: `realtime/apply.ts`).
 */

import type { MissedKind, MissedLineView, MissedSourceView } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { tr, trn } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAiStatus, useMissed, useMissedSummary } from '@/api/hooks';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

function kindLabel(kind: MissedKind): string {
  switch (kind) {
    case 'ask':
      return tr('Asked of you');
    case 'promise':
      return tr('Promised');
    case 'decision':
      return tr('Decided');
    case 'coming':
      return tr('Coming up');
  }
}

const open = (conversationId: string, seq: number) =>
  router.navigate({ pathname: '/c/[id]', params: { id: conversationId, seq: String(seq) } });

function Line({ conversationId, line }: { conversationId: string; line: MissedLineView }) {
  return (
    <Pressable
      onPress={() => open(conversationId, line.seq)}
      accessibilityRole="button"
      accessibilityLabel={tr('{kind}: {text}', { kind: kindLabel(line.kind), text: line.text })}
      style={{ paddingVertical: 6, gap: 2 }}
      testID="missed-line"
    >
      <Text variant="captionStrong" color="textSecondary">
        {kindLabel(line.kind)}
      </Text>
      <Text variant="body" numberOfLines={2} auto>
        {line.text}
      </Text>
      <Text variant="caption" color="textTertiary" auto>
        {line.who}
      </Text>
    </Pressable>
  );
}

function Source({ source }: { source: MissedSourceView }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => open(source.conversationId, source.seq)}
      accessibilityRole="button"
      accessibilityLabel={tr('Open {title}', { title: source.title })}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: t.radii.md,
        backgroundColor: t.c.surface,
      }}
      testID="missed-source"
    >
      <Text variant="captionStrong" numberOfLines={1} auto>
        {source.title}
      </Text>
    </Pressable>
  );
}

export function MissedCard() {
  const t = useTheme();
  const me = useMe();
  const status = useAiStatus();
  const [asked, setAsked] = useState(false);
  const recap = useMissed();
  const summed = useMissedSummary(asked);
  const view = recap.data;
  if (!view || view.conversations.length === 0) return null;
  const aiReady = Boolean(status.data?.available) && me.aiEnabled && !me.minor;
  const summary = summed.data?.summary ?? null;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8 }} testID="missed-card">
      <SectionTitle testID="home-missed">{tr('What you missed')}</SectionTitle>
      <View
        accessible={false}
        style={{
          padding: 14,
          gap: 10,
          borderRadius: t.radii.lg,
          backgroundColor: t.c.surfaceMuted,
        }}
      >
        <Text variant="caption" color="textSecondary" testID="missed-count">
          {tr('{messages} in {conversations}', {
            messages: trn(view.unread, '{n} new message', '{n} new messages'),
            conversations: trn(view.conversations.length, '{n} conversation', '{n} conversations'),
          })}
        </Text>
        {view.conversations.map((c) => (
          <View key={c.id} style={{ gap: 2 }} testID={`missed-${c.id}`}>
            <Pressable
              onPress={() => open(c.id, c.firstNewSeq)}
              accessibilityRole="button"
              accessibilityLabel={tr('Open {title}', { title: c.title })}
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}
              testID="missed-conversation"
            >
              <Text variant="bodyStrong" numberOfLines={1} auto style={{ flexShrink: 1 }}>
                {c.title}
              </Text>
              <Text variant="caption" color="textSecondary">
                {trn(c.unread, '{n} new', '{n} new')}
              </Text>
            </Pressable>
            {c.lines.map((line) => (
              <Line key={line.messageId} conversationId={c.id} line={line} />
            ))}
          </View>
        ))}
        {view.more > 0 ? (
          <Text variant="caption" color="textSecondary">
            {trn(
              view.more,
              'And {n} more conversation needs you.',
              'And {n} more conversations need you.',
            )}
          </Text>
        ) : null}
        {aiReady && !summary ? (
          <Button
            label={tr('Sum it up')}
            size="sm"
            variant="secondary"
            loading={asked && summed.isLoading}
            onPress={() => setAsked(true)}
            testID="missed-summarise"
          />
        ) : null}
        {asked && summed.isError ? (
          <Text variant="caption" color="textSecondary" testID="missed-summary-failed">
            {(summed.error as Error).message}
          </Text>
        ) : null}
        {summary ? (
          <View style={{ gap: 8 }} testID="missed-summary">
            <Text variant="body" auto>
              {summary.text}
            </Text>
            {summary.sources.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {summary.sources.map((s) => (
                  <Source key={s.messageId} source={s} />
                ))}
              </View>
            ) : null}
            <Text variant="caption" color="textSecondary">
              {tr(summed.data?.label ?? AI_LABEL)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
