import type { SearchAnswerResponse } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { formatListTime, snippetParts } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { CAI_ID } from '@caime/core/system-ids';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import { ActivityIndicator, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';

/**
 * "Ask Cai" in Search (R66): a question typed as a sentence, answered from what search finds in
 * the person's own messages, decisions and to-dos, with what the answer rests on. Asked only on
 * a tap (each answer is a model call on their allowance), shown for the question it answered,
 * and kept nowhere.
 */
export function CaiAnswer({
  question,
  open,
}: {
  question: string;
  open: (go: () => void) => void;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const ask = useMutation({
    mutationFn: (q: string) =>
      endpoints.searchAnswer(q).then((r): { q: string; r: SearchAnswerResponse } => ({ q, r })),
  });
  const shown = ask.data?.q === question ? ask.data.r : null;
  const pending = ask.isPending && ask.variables === question;
  if (!shown)
    return (
      <ListRow
        left={<Avatar id={CAI_ID} name="Cai" size={40} />}
        title={tr('Ask Cai')}
        subtitle={
          ask.isError && ask.variables === question ? (ask.error as Error).message : question
        }
        right={pending ? <ActivityIndicator color={t.c.accentStrong} /> : null}
        disabled={pending}
        onPress={() => ask.mutate(question)}
        testID="search-ask-cai"
      />
    );
  const { messages = [], decisions = [], tasks = [] } = shown.sources;
  return (
    <View
      accessibilityLiveRegion="polite"
      testID="search-cai-answer"
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        gap: 8,
        borderRadius: t.radii.md,
        backgroundColor: t.c.surfaceMuted,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar id={CAI_ID} name="Cai" size={24} />
        <Sparkles size={13} color={t.c.accentStrong} />
        <Text variant="overline" color="accentStrong">
          {tr(shown.label ?? AI_LABEL)}
        </Text>
      </View>
      {shown.answer ? (
        <Text variant="body" auto={shown.answer} selectable>
          {shown.answer}
        </Text>
      ) : (
        <Text variant="body" color="textSecondary">
          {tr('Nothing in your messages answers that yet.')}
        </Text>
      )}
      {messages.map((m) => {
        const parts = [
          ...snippetParts(m.snippet),
          { text: ` · ${formatListTime(m.createdAt, now, timeZone, locale)}`, match: false },
        ];
        return (
          <ListRow
            key={m.id}
            icon={MessageCircle}
            title={m.senderName ?? tr('Message')}
            subtitle={parts.map((p) => p.text).join('')}
            subtitleParts={parts}
            onPress={() =>
              open(() =>
                router.navigate({
                  pathname: '/c/[id]',
                  params: { id: m.conversationId, seq: String(m.seq) },
                }),
              )
            }
            testID="search-cai-source"
          />
        );
      })}
      {decisions.map((d) => (
        <ListRow
          key={d.id}
          icon={Star}
          title={d.title}
          subtitle={formatListTime(d.decidedAt, now, timeZone, locale)}
          onPress={() =>
            open(() => router.navigate({ pathname: '/c/[id]', params: { id: d.conversationId } }))
          }
          testID="search-cai-source"
        />
      ))}
      {tasks.map((task) => (
        <ListRow
          key={task.id}
          icon={ListChecks}
          title={task.title}
          subtitle={task.relationship ?? undefined}
          onPress={() => open(() => router.navigate('/actions'))}
          testID="search-cai-source"
        />
      ))}
    </View>
  );
}
