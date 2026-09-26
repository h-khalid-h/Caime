import { AI_LABEL } from '@caishy/core/assist';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ListChecks, Sparkles } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { catchUp, useCatchUps } from './catchUp';

/**
 * AI assist for a whole conversation (PRD §45): catch me up, and find its follow-ups. Both are
 * suggestions: the summary is labelled, and follow-ups arrive as offers to accept or dismiss.
 */
export function AssistTools({ conversationId }: { conversationId: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const result = useCatchUps((s) => s.byId[conversationId]);
  const [finding, setFinding] = useState(false);

  const find = async () => {
    setFinding(true);
    try {
      const r = await endpoints.findActions(conversationId);
      const n = r.found.length;
      toast(n ? `${n} follow-up${n === 1 ? '' : 's'} to review` : 'Nothing new to follow up');
      void qc.invalidateQueries({ queryKey: ['suggestions'] });
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
          label="Catch me up"
          icon={Sparkles}
          size="sm"
          variant="secondary"
          loading={result?.state === 'loading'}
          onPress={() => void catchUp(conversationId)}
          testID="assist-catch-up"
        />
        <Button
          label="Find follow-ups"
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
          style={{ padding: 12, borderRadius: 14, gap: 6, backgroundColor: t.c.surfaceMuted }}
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
                  {result.label ?? AI_LABEL}
                </Text>
              </View>
              <Text variant="body" auto={result.summary} selectable>
                {result.summary}
              </Text>
            </>
          ) : (
            <Text variant="body" color="textSecondary">
              Nothing to catch up on yet.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
