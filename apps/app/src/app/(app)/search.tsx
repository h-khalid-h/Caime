import { formatListTime, snippetParts } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
import { parseSearchQuery } from '@caime/core/search';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import { NetworkError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { searchOnDevice } from '@/features/search/onDevice';
import { useNow, useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { Guide } from '@/ui/Guide';
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
  msg('DATA C'),
  'links in work',
];

export default function Search() {
  const t = useTheme();
  const { desktop } = useLayout();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  // How long finding something takes (PRD §83): from the first letter to opening a result, or
  // leaving with nothing opened. Only that is sent, never what was searched for.
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!term.trim()) started.current = null;
    else started.current ??= Date.now();
  }, [term]);
  const report = useRef((found: boolean) => {
    if (started.current === null) return;
    const ms = Math.min(3_600_000, Date.now() - started.current);
    started.current = null;
    void endpoints.searchOutcome({ found, ms }).catch(() => {});
  }).current;
  useEffect(() => () => report(false), [report]);
  const open = (go: () => void) => {
    report(true);
    go();
  };
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
  // Offline, what's on this device is searched instead, and says so (PRD §49).
  const qc = useQueryClient();
  const me = useMe();
  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () =>
    onlineManager.isOnline(),
  );
  const offline = debounced.length >= 2 && (!online || q.error instanceof NetworkError);
  const local = useMemo(
    () => (offline ? searchOnDevice(qc, debounced, me.id) : null),
    [offline, qc, debounced, me.id],
  );
  const r = local ?? q.data?.results;
  const nothing =
    (local ? true : q.isFetched) &&
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
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : null
        }
        title={tr('Search')}
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
            placeholder={tr('People, messages, files, decisions…')}
            value={term}
            onChangeText={setTerm}
            autoFocus
            returnKeyType="search"
            accessibilityLabel={tr('Search')}
            testID="search-input"
          />
          {offline ? (
            <Text variant="caption" color="warning" testID="search-offline">
              {tr('Offline. Showing what’s on this device.')}
            </Text>
          ) : interpretation ? (
            <Text variant="caption" color="textSecondary">
              {interpretation}
            </Text>
          ) : null}
        </View>
        {!debounced ? (
          <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
            <Guide character="pico" expression="curious" icon={SearchIcon} size={100} />
            <Text variant="body" color="textSecondary" align="center">
              {tr('Search the way you think about people. Try:')}
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
                  {tr(e)}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        {r?.people?.length ? (
          <>
            <SectionTitle>{tr('People')}</SectionTitle>
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
                  open(() => router.navigate({ pathname: '/p/[id]', params: { id: p.person.id } }))
                }
              />
            ))}
          </>
        ) : null}
        {r?.organizations?.length ? (
          <>
            <SectionTitle>{tr('Organizations')}</SectionTitle>
            {r.organizations.map((o) => (
              <ListRow
                key={o.name ?? ''}
                icon={Building}
                title={o.name ?? ''}
                subtitle={trn(o.people, '{n} person', '{n} people')}
                onPress={() => setTerm(o.name ?? '')}
              />
            ))}
          </>
        ) : null}
        {r?.messages?.length ? (
          <>
            <SectionTitle>{tr('Messages')}</SectionTitle>
            {r.messages.map((m) => {
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
                />
              );
            })}
          </>
        ) : null}
        {r?.files?.length ? (
          <>
            <SectionTitle>{tr('Files and links')}</SectionTitle>
            {r.files.map((f) => (
              <ListRow
                key={f.id}
                icon={f.kind === 'link' ? Link : FileText}
                title={f.title ?? f.file?.name ?? f.host ?? tr('File')}
                subtitle={f.host ?? formatListTime(f.createdAt, now, timeZone, locale)}
                onPress={() =>
                  open(() =>
                    router.navigate({ pathname: '/c/[id]', params: { id: f.conversationId } }),
                  )
                }
              />
            ))}
          </>
        ) : null}
        {r?.tasks?.length ? (
          <>
            <SectionTitle>{tr('Actions')}</SectionTitle>
            {r.tasks.map((task) => (
              <ListRow
                key={task.id}
                icon={ListChecks}
                title={task.title}
                subtitle={task.relationship ?? undefined}
                onPress={() => open(() => router.navigate('/actions'))}
              />
            ))}
          </>
        ) : null}
        {r?.decisions?.length ? (
          <>
            <SectionTitle>{tr('Decisions')}</SectionTitle>
            {r.decisions.map((d) => (
              <ListRow
                key={d.id}
                icon={Star}
                title={d.title}
                subtitle={formatListTime(d.decidedAt, now, timeZone, locale)}
                onPress={() =>
                  open(() =>
                    router.navigate({ pathname: '/c/[id]', params: { id: d.conversationId } }),
                  )
                }
              />
            ))}
          </>
        ) : null}
        {r?.contexts?.length ? (
          <>
            <SectionTitle>{tr('Conversations')}</SectionTitle>
            {r.contexts.map((c) => (
              <ListRow
                key={c.conversationId}
                icon={Hash}
                title={c.title ?? tr('Conversation')}
                subtitle={c.context?.title ?? undefined}
                onPress={() =>
                  open(() =>
                    router.navigate({ pathname: '/c/[id]', params: { id: c.conversationId } }),
                  )
                }
              />
            ))}
          </>
        ) : null}
        {nothing ? (
          <Text variant="body" color="textSecondary" align="center" style={{ padding: 24 }}>
            {local
              ? tr('Nothing on this device for “{debounced}”. Try again when you’re back online.', {
                  debounced,
                })
              : tr('Nothing found for “{debounced}”.', { debounced })}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
