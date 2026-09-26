import { formatListTime, snippetParts } from '@caishy/core/format';
import { parseSearchQuery } from '@caishy/core/search';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Character } from '@/brand/Character';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import {
  ArrowLeft,
  Building,
  FileText,
  Hash,
  Link,
  ListChecks,
  MessageCircle,
  Search as SearchIcon,
  Star,
} from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

const EXAMPLES = [
  'my manager',
  'files from Sarah',
  'decisions last week',
  'DATA C',
  'links in work',
];

export default function Search() {
  const t = useTheme();
  const { desktop } = useLayout();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);
  const interpretation = useMemo(
    () => (debounced ? parseSearchQuery(debounced).interpretation : null),
    [debounced],
  );
  const q = useQuery({
    queryKey: qk.search(debounced),
    queryFn: () => endpoints.search(debounced),
    enabled: debounced.length >= 2,
  });
  const r = q.data?.results;
  const nothing =
    q.isFetched &&
    r &&
    !r.people?.length &&
    !r.messages?.length &&
    !r.files?.length &&
    !r.tasks?.length &&
    !r.decisions?.length &&
    !r.contexts?.length &&
    !r.organizations?.length;

  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          !desktop ? (
            <IconButton
              icon={ArrowLeft}
              label="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : null
        }
        title="Search"
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          maxWidth: 760,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 16, gap: 8 }}>
          <TextField
            icon={SearchIcon}
            placeholder="People, messages, files, decisions…"
            value={term}
            onChangeText={setTerm}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search"
            testID="search-input"
          />
          {interpretation ? (
            <Text variant="caption" color="textSecondary">
              {interpretation}
            </Text>
          ) : null}
        </View>
        {!debounced ? (
          <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
            <Character name="pico" expression="curious" size={100} />
            <Text variant="body" color="textSecondary" align="center">
              Search the way you think about people. Try:
            </Text>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
            >
              {EXAMPLES.map((e) => (
                <Text
                  key={e}
                  variant="captionStrong"
                  color="link"
                  onPress={() => setTerm(e)}
                  accessibilityRole="button"
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 12,
                    backgroundColor: t.c.surfaceMuted,
                    overflow: 'hidden',
                  }}
                >
                  {e}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        {r?.people?.length ? (
          <>
            <SectionTitle>People</SectionTitle>
            {r.people.map((p) => (
              <ListRow
                key={p.person.id}
                left={
                  <Avatar
                    id={p.person.id}
                    name={p.person.displayName}
                    url={p.person.avatarUrl}
                    size={40}
                  />
                }
                title={p.person.displayName}
                subtitle={`@${p.person.handle}`}
                right={
                  p.relationship ? (
                    <RelationshipChip label={p.relationship.label} sphere={p.relationship.sphere} />
                  ) : null
                }
                onPress={() =>
                  router.navigate({ pathname: '/p/[id]', params: { id: p.person.id } })
                }
              />
            ))}
          </>
        ) : null}
        {r?.organizations?.length ? (
          <>
            <SectionTitle>Organizations</SectionTitle>
            {r.organizations.map((o) => (
              <ListRow
                key={o.name ?? ''}
                icon={Building}
                title={o.name ?? ''}
                subtitle={`${o.people} ${o.people === 1 ? 'person' : 'people'}`}
                onPress={() => setTerm(o.name ?? '')}
              />
            ))}
          </>
        ) : null}
        {r?.messages?.length ? (
          <>
            <SectionTitle>Messages</SectionTitle>
            {r.messages.map((m) => {
              const parts = [
                ...snippetParts(m.snippet),
                { text: ` · ${formatListTime(m.createdAt, now, timeZone, locale)}`, match: false },
              ];
              return (
                <ListRow
                  key={m.id}
                  icon={MessageCircle}
                  title={m.senderName ?? 'Message'}
                  subtitle={parts.map((p) => p.text).join('')}
                  subtitleParts={parts}
                  onPress={() =>
                    router.navigate({
                      pathname: '/c/[id]',
                      params: { id: m.conversationId, seq: String(m.seq) },
                    })
                  }
                />
              );
            })}
          </>
        ) : null}
        {r?.files?.length ? (
          <>
            <SectionTitle>Files and links</SectionTitle>
            {r.files.map((f) => (
              <ListRow
                key={f.id}
                icon={f.kind === 'link' ? Link : FileText}
                title={f.title ?? f.file?.name ?? f.host ?? 'File'}
                subtitle={f.host ?? formatListTime(f.createdAt, now, timeZone, locale)}
                onPress={() =>
                  router.navigate({ pathname: '/c/[id]', params: { id: f.conversationId } })
                }
              />
            ))}
          </>
        ) : null}
        {r?.tasks?.length ? (
          <>
            <SectionTitle>Actions</SectionTitle>
            {r.tasks.map((task) => (
              <ListRow
                key={task.id}
                icon={ListChecks}
                title={task.title}
                subtitle={task.relationship ?? undefined}
                onPress={() => router.navigate('/actions')}
              />
            ))}
          </>
        ) : null}
        {r?.decisions?.length ? (
          <>
            <SectionTitle>Decisions</SectionTitle>
            {r.decisions.map((d) => (
              <ListRow
                key={d.id}
                icon={Star}
                title={d.title}
                subtitle={formatListTime(d.decidedAt, now, timeZone, locale)}
                onPress={() =>
                  router.navigate({ pathname: '/c/[id]', params: { id: d.conversationId } })
                }
              />
            ))}
          </>
        ) : null}
        {r?.contexts?.length ? (
          <>
            <SectionTitle>Conversations</SectionTitle>
            {r.contexts.map((c) => (
              <ListRow
                key={c.conversationId}
                icon={Hash}
                title={c.title ?? 'Conversation'}
                subtitle={c.context?.title ?? undefined}
                onPress={() =>
                  router.navigate({ pathname: '/c/[id]', params: { id: c.conversationId } })
                }
              />
            ))}
          </>
        ) : null}
        {nothing ? (
          <Text variant="body" color="textSecondary" align="center" style={{ padding: 24 }}>
            Nothing found for “{debounced}”.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
