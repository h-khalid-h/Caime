/**
 * A question typed to Cai about a call, in any mode (R114 (2), M17 I13f): answered to the asker
 * alone, in writing, from what was said in the notes they may read, citing its lines; kept
 * nowhere. Opened in the call from the Cai round, and after it from the notes sheet; loaded apart
 * wherever it's opened. A cited line plays the recording from its moment where one is playable.
 */
import type { CallNotesAnswerView } from '@caime/core/api';
import { AI_LABEL, ASK_MAX } from '@caime/core/assist';
import { formatClock } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useEmptied } from '@/lib/emptied';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

type Asked = { question: string; answer: CallNotesAnswerView };

export function AskCai({
  callId,
  open,
  onClose,
  play,
}: {
  callId: string;
  open: boolean;
  onClose: () => void;
  /** Plays the recording from a moment, where it can (the notes sheet); else null. */
  play: ((at: string) => void) | null;
}) {
  const t = useTheme();
  const { timeZone, locale } = useUserClock();
  const [question, setQuestion] = useState('');
  const questionBox = useRef<TextInput>(null);
  const { empty: emptyAsked, echoes: echoesAsked } = useEmptied(questionBox);
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<Asked | null>(null);
  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      setAsked({ question: q, answer: await endpoints.askAboutCall(callId, q) });
      emptyAsked(setQuestion);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setAsking(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Ask Cai about the call')}
      subtitle={tr('Answered to you alone, from what was said; nothing is kept.')}
    >
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextField
            label={tr('Your question')}
            placeholder={tr('What did we agree on the price?')}
            value={question}
            ref={questionBox}
            onChangeText={(v) => {
              if (!echoesAsked(question, v)) setQuestion(v);
            }}
            maxLength={ASK_MAX}
            returnKeyType="send"
            onSubmitEditing={() => void ask()}
            style={{ flex: 1 }}
            testID="ask-cai-question"
          />
          <Button
            label={tr('Ask')}
            size="md"
            loading={asking}
            disabled={!question.trim()}
            onPress={() => void ask()}
            testID="ask-cai-send"
          />
        </View>
        {asked ? (
          <View
            accessibilityLiveRegion="polite"
            testID="ask-cai-answer"
            style={{
              padding: 12,
              borderRadius: t.radii.md,
              gap: 8,
              backgroundColor: t.c.surfaceMuted,
            }}
          >
            <Text variant="caption" color="textSecondary" auto={asked.question}>
              {asked.question}
            </Text>
            {asked.answer.answer ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} color={t.c.accentStrong} />
                  <Text variant="overline" color="accentStrong">
                    {tr(asked.answer.label ?? AI_LABEL)}
                  </Text>
                </View>
                <Text variant="body" auto={asked.answer.answer} selectable>
                  {asked.answer.answer}
                </Text>
                {asked.answer.cited.length ? (
                  <View style={{ gap: 6 }} testID="ask-cai-cited">
                    <Text variant="overline" color="textSecondary">
                      {tr('From the call')}
                    </Text>
                    {asked.answer.cited.map((line) => {
                      const head = `${line.mine ? tr('You') : line.speaker} · ${formatClock(line.at, timeZone, locale)}`;
                      const body = (
                        <View key={line.lineId} style={{ gap: 2 }}>
                          <Text variant="caption" color={play ? 'link' : 'textSecondary'}>
                            {head}
                          </Text>
                          <Text variant="body" auto={line.text}>
                            {line.text}
                          </Text>
                        </View>
                      );
                      return play ? (
                        <Pressable
                          key={line.lineId}
                          accessibilityRole="button"
                          accessibilityLabel={tr('Play from {time}', {
                            time: formatClock(line.at, timeZone, locale),
                          })}
                          onPress={() => play(line.at)}
                          testID="ask-cai-cited-line"
                        >
                          {body}
                        </Pressable>
                      ) : (
                        <View key={line.lineId} testID="ask-cai-cited-line">
                          {body}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : (
              <Text variant="body" color="textSecondary" testID="ask-cai-nothing">
                {tr('Nothing has been said yet to answer from.')}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
