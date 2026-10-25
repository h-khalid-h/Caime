/**
 * The brief before a meeting (R58): what Caime remembers of the two of you since the last such
 * card, read from the card. Rules first; the AI summary only where the reader has assist on,
 * labelled as such. Loaded when opened.
 */
import type { BriefView } from '@caime/core/api';
import { formatDue, formatListTime } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { afterSheet, Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

/** Where the summary's words came from (M17 I4): the messages, each a tap to its place. */
const AnswerSources = lazy(() =>
  import('@/features/assist/AnswerSources').then((m) => ({ default: m.AnswerSources })),
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="overline" color="textTertiary" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function BriefSheet({
  messageId,
  title,
  onClose,
}: {
  messageId: string | null;
  title: string;
  onClose: () => void;
}) {
  // Read when the sheet opens; the query lives here, with the sheet, out of the startup chunk.
  const q = useQuery({
    queryKey: qk.brief(messageId ?? ''),
    queryFn: () => endpoints.brief(messageId ?? ''),
    enabled: Boolean(messageId),
    staleTime: 60_000,
  });
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const b: BriefView | undefined = q.data;
  return (
    <Sheet
      open={messageId !== null}
      onClose={onClose}
      title={tr('Before {title}', { title })}
      subtitle={
        b
          ? trn(b.messages, '{n} message since {since}', '{n} messages since {since}', {
              since: formatListTime(b.since, now, timeZone, locale),
            })
          : undefined
      }
    >
      {!b ? (
        q.isError ? (
          <Text variant="body" color="danger">
            {(q.error as Error).message}
          </Text>
        ) : (
          <SkeletonRows count={3} />
        )
      ) : (
        <View style={{ gap: 18 }} testID="brief">
          {b.moved ? (
            // What slipped (R119): the plan moving, never a time put back on its own clock.
            <Text variant="body" color="textSecondary" testID="brief-moved">
              {trn(b.moved, 'Moved once', 'Moved {n} times')}
            </Text>
          ) : null}
          {b.summary ? (
            <Section title={b.label ? tr(b.label) : tr('Summary')}>
              <Text variant="body" auto>
                {b.summary}
              </Text>
              {b.sources.length ? (
                <Suspense fallback={null}>
                  <AnswerSources
                    sources={b.sources}
                    onOpen={(source) => {
                      // The message is in its conversation: hand on once the sheet has gone.
                      onClose();
                      afterSheet(() => {
                        void import('@/features/assist/AnswerSources').then((m) =>
                          m.openSource(source),
                        );
                      });
                    }}
                    testID="brief-source"
                  />
                </Suspense>
              ) : null}
            </Section>
          ) : null}
          {b.decisions.length ? (
            <Section title={tr('Decided')}>
              {b.decisions.map((d) => (
                <Text key={d.id} variant="body" auto>
                  {d.title}
                </Text>
              ))}
            </Section>
          ) : null}
          {b.promises.length ? (
            <Section title={tr('Still open')}>
              {b.promises.map((p) => (
                <Text key={p.id} variant="body" auto>
                  {p.direction === 'mine' ? tr('You: {title}', { title: p.title }) : p.title}
                  {p.dueAt ? ` · ${formatDue(p.dueAt, now, timeZone, locale)}` : ''}
                  {p.moved ? ` · ${trn(p.moved, 'Moved once', 'Moved {n} times')}` : ''}
                </Text>
              ))}
            </Section>
          ) : null}
          {b.questions.length ? (
            <Section title={tr('Asked, not answered')}>
              {b.questions.map((x) => (
                <Text key={x.messageId} variant="body" auto>
                  {x.preview}
                </Text>
              ))}
            </Section>
          ) : null}
          {b.files.length ? (
            <Section title={tr('Shared')}>
              {b.files.map((f) => (
                <Text key={f.id} variant="body" auto>
                  {f.name}
                </Text>
              ))}
            </Section>
          ) : null}
          {!b.summary &&
          !b.moved &&
          !b.decisions.length &&
          !b.promises.length &&
          !b.questions.length &&
          !b.files.length ? (
            <Text variant="body" color="textSecondary">
              {tr('Nothing open between you since last time.')}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
