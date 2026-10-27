/**
 * The meeting's conversation on a guest's page (R121 (5), M17 I13j). A guest has no app (R84),
 * so their page carries the chat: what's written there, as it arrives (the socket patches the
 * same messages a member's screen reads), and, while its call is on and they're in it, a line to
 * write words in, for a guest who said they're 18 or over. The server holds them to all of it
 * (`assertGuestMayWrite`); this offers only what it allows. The call's Chat makes the call small
 * over this page, and what this page shows is what the call's count has been read up to.
 */
import type { MessageView } from '@caime/core/api';
import { formatClock, messagePreview } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useMessages } from '@/api/hooks';
import { useUserClock } from '@/lib/time';
import { addSentMessage, flatMessages } from '@/state/cache';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** The latest lines shown; earlier ones come a page at a time. */
const SHOWN = 30;

export function GuestChat({
  conversationId,
  adult,
  names,
}: {
  conversationId: string;
  /** They said they're 18 or over (R85 (3)): the only guests who write here. */
  adult: boolean;
  /** Who's who in the meeting, by id. */
  names: ReadonlyMap<string, string>;
}) {
  const me = useSession((s) => s.user?.id);
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const pages = useMessages(conversationId);
  const all = useMemo(() => flatMessages(pages.data), [pages.data]);
  const [more, setMore] = useState(0);
  const shown = all.slice(-(SHOWN + more));
  const inCall = useGroupCall((s) => s.phase === 'in' && s.call?.conversationId === conversationId);
  // Nothing covers the page: what's on it is read, and the call's Chat counts only what's newer.
  const covered = useGroupCall((s) => Boolean(s.phase && s.phase !== 'ended' && !s.shrunk));
  const latest = all.at(-1)?.seq ?? 0;
  useEffect(() => {
    const calls = useGroupCall.getState();
    if (!covered && latest > calls.chatSeenSeq) calls.patch({ chatSeenSeq: latest });
  }, [covered, latest]);

  const [text, setText] = useState('');
  // One id for these words, so pressing again after a failure sends them once (ADR-8).
  const [clientId, setClientId] = useState(uuidv4);
  const send = useMutation({
    mutationFn: (body: string) => endpoints.send(conversationId, { clientId, kind: 'text', body }),
    onSuccess: (r) => {
      addSentMessage(qc, r.message);
      setText('');
      setClientId(uuidv4());
    },
  });
  const words = text.trim();

  const nameOf = (m: MessageView) =>
    m.senderId === me ? tr('You') : ((m.senderId && names.get(m.senderId)) ?? tr('Someone'));

  return (
    <View style={{ gap: 8 }} testID="guest-chat">
      <SectionTitle>{tr('Chat')}</SectionTitle>
      {pages.isError && !pages.data ? (
        <Text variant="caption" color="textSecondary">
          {tr('The chat didn’t load. It comes back when you’re connected.')}
        </Text>
      ) : null}
      {all.length > shown.length || pages.hasNextPage ? (
        <Button
          label={tr('Earlier messages')}
          variant="ghost"
          onPress={() => {
            if (all.length > shown.length) setMore((n) => n + SHOWN);
            else void pages.fetchNextPage().then(() => setMore((n) => n + SHOWN));
          }}
          testID="guest-chat-earlier"
        />
      ) : null}
      <View style={{ gap: 10 }} aria-live="polite">
        {shown.map((m) =>
          m.kind === 'system' ? (
            <Text key={m.id} variant="caption" color="textTertiary" align="center">
              {messagePreview({ kind: m.kind, body: m.body, payload: m.payload, deleted: false })}
            </Text>
          ) : (
            <View key={m.id} accessible accessibilityRole="text" testID="guest-chat-line">
              <Text variant="captionStrong" color="textSecondary">
                {[
                  nameOf(m),
                  m.payload.guest ? tr('Guest') : '',
                  formatClock(m.createdAt, timeZone, locale),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text variant="body" auto={m.kind === 'text' && !m.deletedAt}>
                {m.kind === 'text' && !m.deletedAt && m.body
                  ? m.body
                  : messagePreview({
                      kind: m.kind,
                      body: m.body,
                      payload: m.payload,
                      deleted: Boolean(m.deletedAt),
                      sealed: m.sealed,
                    })}
              </Text>
            </View>
          ),
        )}
      </View>
      {!adult ? (
        <Text variant="caption" color="textSecondary" testID="guest-chat-read-only">
          {tr('You read the chat here. Writing in it is for guests 18 or over.')}
        </Text>
      ) : inCall ? (
        <View style={{ gap: 8 }}>
          <TextField
            label={tr('Message')}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (send.isError) send.reset();
            }}
            multiline
            maxLength={10_000}
            testID="guest-chat-input"
          />
          {send.error ? (
            <Text variant="caption" color="danger">
              {send.error instanceof ApiError
                ? send.error.message
                : tr('It wasn’t sent. Try again.')}
            </Text>
          ) : null}
          <Button
            label={tr('Send')}
            onPress={() => send.mutate(words)}
            disabled={!words || send.isPending}
            loading={send.isPending}
            testID="guest-chat-send"
          />
        </View>
      ) : (
        <Text variant="caption" color="textSecondary" testID="guest-chat-later">
          {tr('You can write here while you’re in the call.')}
        </Text>
      )}
    </View>
  );
}
