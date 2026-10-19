import type { AgentDraftView } from '@caime/core/api';
import { formatWhenAt } from '@caime/core/format';
import { listed, sentence, tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/**
 * Its AI agent's draft, for the team (M16 G6b): what the customer would read, what sending it
 * also does, and what it rests on. Send sends it as the agent's, Edit takes its words into the
 * composer as the person's own reply, Let go drops it. The customer never sees it.
 */
export function AgentDraft({
  conversationId,
  draft,
  onEdit,
}: {
  conversationId: string;
  draft: AgentDraftView;
  /** Its words into the composer, for the person to change and send as theirs. */
  onEdit: (words: string) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState<'send' | 'edit' | 'drop' | null>(null);
  const act = async (kind: NonNullable<typeof busy>, fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await fn();
      void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
      void qc.invalidateQueries({ queryKey: qk.allOrgInboxes });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
    } finally {
      setBusy(null);
    }
  };
  // What sending it does beyond its words, as the card would say.
  const also = draft.booking
    ? tr('Sending it books {what} for {when}.', {
        what: draft.booking.title,
        when: formatWhenAt(draft.booking.at, true, new Date(), timeZone, locale),
      })
    : draft.order
      ? tr('Sending it writes down an order: {lines}.', {
          lines: listed(draft.order.lines.map((l) => `${l.quantity} × ${l.name}`)),
        })
      : draft.action === 'resolve'
        ? tr('Sending it closes the conversation.')
        : null;
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginBottom: 6,
        padding: 12,
        gap: 6,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: t.c.border,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID="agent-draft"
    >
      <Text variant="captionStrong" color="textSecondary">
        {tr('Draft by your AI agent · the customer hasn’t seen it')}
      </Text>
      <Text variant="body" auto>
        {draft.body}
      </Text>
      {also ? (
        <Text variant="caption" color="textSecondary">
          {also}
        </Text>
      ) : null}
      {draft.cited.length ? (
        <View style={{ gap: 2 }} testID="agent-draft-cited">
          <Text variant="captionStrong" color="textTertiary">
            {sentence(tr('from what it knows'))}
          </Text>
          {draft.cited.map((c) => (
            <Text key={c.n} variant="caption" color="textTertiary">
              “{c.text}”
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
        <Button
          label={tr('Send')}
          size="sm"
          loading={busy === 'send'}
          disabled={busy !== null}
          onPress={() =>
            void act('send', () => endpoints.sendAgentDraft(conversationId, draft.seq))
          }
          testID="agent-draft-send"
        />
        <Button
          label={tr('Edit')}
          variant="secondary"
          size="sm"
          loading={busy === 'edit'}
          disabled={busy !== null}
          onPress={() =>
            void act('edit', async () => {
              await endpoints.dropAgentDraft(conversationId, draft.seq, true);
              onEdit(draft.message);
            })
          }
          testID="agent-draft-edit"
        />
        <Button
          label={tr('Let go')}
          variant="ghost"
          size="sm"
          loading={busy === 'drop'}
          disabled={busy !== null}
          onPress={() =>
            void act('drop', () => endpoints.dropAgentDraft(conversationId, draft.seq, false))
          }
          testID="agent-draft-drop"
        />
      </View>
    </View>
  );
}
