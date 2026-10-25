import type { AnswerSourceView } from '@caime/core/api';
import { AI_LABEL, ASK_MAX } from '@caime/core/assist';
import { tr, trn } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MessageCircleQuestion from 'lucide-react-native/icons/message-circle-question-mark';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { lazy, Suspense, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { catchUp, useCatchUps } from './catchUp';

type Answer = {
  question: string;
  answer: string | null;
  label: string | null;
  sources: AnswerSourceView[];
};

/** Where an answer's words came from (M17 I4), loaded when there is one. */
const AnswerSources = lazy(() =>
  import('@/features/assist/AnswerSources').then((m) => ({ default: m.AnswerSources })),
);

/**
 * AI assist for a whole conversation (PRD §45): catch me up, find its follow-ups, and ask it a
 * question (R67). All are suggestions: the summary and the answer are labelled and kept nowhere,
 * and follow-ups arrive as offers to accept or dismiss.
 */
export function AssistTools({
  conversationId,
  onJump,
}: {
  conversationId: string;
  /** Opens a cited message at its place in this conversation (the panel's jump). */
  onJump?: (seq: number) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const result = useCatchUps((s) => s.byId[conversationId]);
  const [finding, setFinding] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  // A cited message is in this conversation: jump to it rather than open the route again.
  const jumpTo = (source: AnswerSourceView) => {
    if (source.kind === 'message' && onJump) onJump(source.seq);
    else void import('@/features/assist/AnswerSources').then((m) => m.openSource(source));
  };
  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const r = await endpoints.askConversation(conversationId, q);
      setAnswer({ question: q, answer: r.answer, label: r.label, sources: r.sources });
      setQuestion('');
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setAsking(false);
    }
  };

  const find = async () => {
    setFinding(true);
    try {
      const r = await endpoints.findActions(conversationId);
      const n = r.found.length;
      toast(
        n
          ? trn(n, '{n} follow-up to review', '{n} follow-ups to review')
          : tr('Nothing new to follow up'),
      );
      void qc.invalidateQueries({ queryKey: qk.allSuggestions });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setFinding(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label={tr('Catch me up')}
          icon={Sparkles}
          size="sm"
          variant="secondary"
          loading={result?.state === 'loading'}
          onPress={() => void catchUp(conversationId)}
          testID="assist-catch-up"
        />
        <Button
          label={tr('Find follow-ups')}
          icon={ListChecks}
          size="sm"
          variant="secondary"
          loading={finding}
          onPress={() => void find()}
          testID="assist-find"
        />
      </View>
      {result && result.state !== 'loading' ? (
        <View
          accessibilityLiveRegion="polite"
          testID="assist-summary"
          style={{
            padding: 12,
            borderRadius: t.radii.md,
            gap: 6,
            backgroundColor: t.c.surfaceMuted,
          }}
        >
          {result.state === 'failed' ? (
            <Text variant="body" color="danger">
              {result.error}
            </Text>
          ) : result.summary ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={13} color={t.c.accentStrong} />
                <Text variant="overline" color="accentStrong">
                  {tr(result.label ?? AI_LABEL)}
                </Text>
              </View>
              <Text variant="body" auto={result.summary} selectable>
                {result.summary}
              </Text>
              {result.sources.length ? (
                <Suspense fallback={null}>
                  <AnswerSources sources={result.sources} onOpen={jumpTo} testID="summary-source" />
                </Suspense>
              ) : null}
              {result.unread > result.newCount ? (
                // Read only the latest of what's new (M17 I3): said, never passing for the whole.
                <Text variant="caption" color="textSecondary" testID="assist-summary-window">
                  {tr('From the latest {count} of {total} new messages.', {
                    count: result.newCount,
                    total: result.unread,
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="body" color="textSecondary">
              {tr('Nothing to catch up on yet.')}
            </Text>
          )}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <TextField
          label={tr('Ask about this conversation')}
          placeholder={tr('What did we decide about the date?')}
          value={question}
          onChangeText={setQuestion}
          maxLength={ASK_MAX}
          returnKeyType="send"
          onSubmitEditing={() => void ask()}
          style={{ flex: 1 }}
          testID="assist-question"
        />
        <Button
          label={tr('Ask')}
          icon={MessageCircleQuestion}
          size="md"
          variant="secondary"
          loading={asking}
          disabled={!question.trim()}
          onPress={() => void ask()}
          testID="assist-ask"
        />
      </View>
      {answer ? (
        <View
          accessibilityLiveRegion="polite"
          testID="assist-answer"
          style={{
            padding: 12,
            borderRadius: t.radii.md,
            gap: 6,
            backgroundColor: t.c.surfaceMuted,
          }}
        >
          <Text variant="caption" color="textSecondary" auto={answer.question}>
            {answer.question}
          </Text>
          {answer.answer ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={13} color={t.c.accentStrong} />
                <Text variant="overline" color="accentStrong">
                  {tr(answer.label ?? AI_LABEL)}
                </Text>
              </View>
              <Text variant="body" auto={answer.answer} selectable>
                {answer.answer}
              </Text>
              {answer.sources.length ? (
                <Suspense fallback={null}>
                  <AnswerSources sources={answer.sources} onOpen={jumpTo} />
                </Suspense>
              ) : null}
            </>
          ) : (
            <Text variant="body" color="textSecondary">
              {tr('Nothing to answer from yet.')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
