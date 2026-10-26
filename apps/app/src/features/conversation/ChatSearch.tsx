/**
 * Search inside one conversation (M16 E6): the server's search kept to this conversation's
 * messages (`GET /search?conversation=`, by the rules, never a model), asked once the typing
 * settles, each match its sender, the words marked where they were found and when; a tap jumps
 * to it as search's jump does. A private conversation's words never reach the server, so it's
 * offered only in a standard one. Loaded when first opened.
 */
import { formatListTime, snippetParts } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import SearchIcon from 'lucide-react-native/icons/search';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** How long the typing rests before it's asked: one request a word, never one a key. */
const SETTLE_MS = 300;

export function ChatSearch({
  conversationId,
  open,
  onClose,
  onJump,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onJump: (seq: number) => void;
}) {
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), SETTLE_MS);
    return () => clearTimeout(id);
  }, [typed]);
  const found = useQuery({
    queryKey: qk.searchIn(conversationId, term),
    queryFn: () => endpoints.searchIn(conversationId, term),
    enabled: open && term.length >= 2,
    staleTime: 30_000,
  });
  const messages = found.data?.results.messages ?? [];
  return (
    <Sheet open={open} onClose={onClose} title={tr('Search this conversation')}>
      <View style={{ gap: 12 }}>
        <TextField
          icon={SearchIcon}
          value={typed}
          onChangeText={setTyped}
          placeholder={tr('Words, a name, a number')}
          accessibilityLabel={tr('Search this conversation')}
          autoFocus
          testID="chat-search-input"
        />
        {found.isError ? (
          <Text variant="caption" color="textSecondary">
            {tr('Search didn’t answer. Try again in a moment.')}
          </Text>
        ) : term.length >= 2 && found.isSuccess && messages.length === 0 ? (
          <Text variant="caption" color="textSecondary" testID="chat-search-none">
            {tr('Nothing found for “{query}”.', { query: term })}
          </Text>
        ) : null}
        <View testID="chat-search-results">
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
                onPress={() => {
                  onClose();
                  onJump(m.seq);
                }}
                testID={`chat-search-hit-${m.seq}`}
              />
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}
