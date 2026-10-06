import type { PeopleSearchResult } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Search from 'lucide-react-native/icons/search';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openChatWith } from '@/features/inbox/openChat';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { handleLink } from '@/lib/config';
import { shareLink } from '@/lib/share';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { Guide } from '@/ui/Guide';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

/** Asking to connect, in its sheet: loaded the first time it's asked for. */
const ConnectSheet = lazyPart(() =>
  import('@/features/people/ConnectSheet').then((m) => m.ConnectSheet),
);
/** An invite link (R1), in its sheet: loaded the first time someone is invited. */
const InviteSheet = lazyPart(() =>
  import('@/features/people/InviteSheet').then((m) => m.InviteSheet),
);

export default function Connect() {
  const t = useTheme();
  const me = useMe();
  const { desktop } = useLayout();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term.trim());
  const [target, setTarget] = useState<PeopleSearchResult['person'] | null>(null);
  const [inviting, setInviting] = useState(false);
  const results = useQuery({
    queryKey: qk.peopleSearch(debounced),
    queryFn: () => endpoints.searchPeople(debounced),
    enabled: debounced.length >= 2,
  });
  // Businesses, clinics and schools are found here too, and messaged from their page (R15).
  const orgResults = useQuery({
    queryKey: qk.orgSearch(debounced),
    queryFn: () => endpoints.searchOrgs(debounced),
    enabled: debounced.length >= 2,
  });
  const orgs = debounced.length >= 2 ? (orgResults.data?.orgs ?? []) : [];

  const renderItem = ({ item }: { item: PeopleSearchResult }) => {
    const state = item.connection.state;
    const action =
      state === 'connected' ? (
        <Button
          label={tr('Message')}
          size="sm"
          variant="secondary"
          onPress={() => void openChatWith({ conversationId: null, person: item.person })}
        />
      ) : state === 'outgoing' ? (
        <Text variant="captionStrong" color="textTertiary">
          {tr('Requested')}
        </Text>
      ) : state === 'incoming' ? (
        <Button
          label={tr('Respond')}
          size="sm"
          onPress={() => router.push({ pathname: '/p/[id]', params: { id: item.person.id } })}
        />
      ) : item.person.id === me.id ? (
        <Text variant="captionStrong" color="textTertiary">
          {tr('You')}
        </Text>
      ) : (
        <Button
          label={tr('Connect')}
          size="sm"
          onPress={() => setTarget(item.person)}
          testID={`connect-${item.person.handle}`}
        />
      );
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.person.displayName}, @${item.person.handle}, ${item.person.trust.label}`}
        onPress={() => router.push({ pathname: '/p/[id]', params: { id: item.person.id } })}
        style={({ hovered }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: hovered ? t.c.surfaceHover : 'transparent',
        })}
      >
        <Avatar
          id={item.person.id}
          name={item.person.displayName}
          url={item.person.avatarUrl}
          size={46}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.person.displayName}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            @{item.person.handle} · {item.person.trust.label}
          </Text>
          {item.relationship ? (
            <RelationshipChip label={item.relationship.label} sphere={item.relationship.sphere} />
          ) : null}
        </View>
        {action}
      </Pressable>
    );
  };

  const shareHandle = () =>
    void shareLink(
      tr('I’m on Caime as @{handle}. Find me there:', { handle: me.handle }),
      handleLink(me.handle),
    );

  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label={tr('Back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
          />
        }
        title={tr('Connect')}
      />
      <View style={{ padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <TextField
          icon={Search}
          placeholder={tr('@handle, name or email')}
          value={term}
          onChangeText={setTerm}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={tr('Find people')}
          testID="connect-search"
        />
      </View>
      <FlatList
        data={debounced.length >= 2 ? (results.data?.results ?? []) : []}
        keyExtractor={(r) => r.person.id}
        renderItem={renderItem}
        style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          orgs.length ? (
            <View style={{ paddingTop: 8 }}>
              <Text
                variant="overline"
                color="textTertiary"
                style={{ paddingHorizontal: 16, paddingVertical: 6 }}
              >
                {tr('Organizations')}
              </Text>
              {orgs.map((o) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  accessibilityLabel={tr('{name}, organization', { name: o.name })}
                  onPress={() =>
                    router.push({ pathname: '/o/[handle]', params: { handle: o.handle } })
                  }
                  testID={`connect-org-${o.handle}`}
                  style={({ hovered }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: hovered ? t.c.surfaceHover : 'transparent',
                  })}
                >
                  <OrgMark kind={o.kind} url={o.avatarUrl} size={46} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1} auto>
                      {o.name}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      @{o.handle}
                    </Text>
                    <VerifiedLine org={o} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          orgs.length ? null : debounced.length >= 2 && results.isFetched ? (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text variant="body" color="textSecondary" align="center">
                {tr(
                  'No one found for “{debounced}”. They may not be on Caime yet, or they keep their profile private.',
                  { debounced },
                )}
              </Text>
              <Button
                label={tr('Invite them')}
                variant="secondary"
                onPress={() => setInviting(true)}
                testID="connect-invite"
              />
            </View>
          ) : (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Guide character="pico" expression="curious" icon={UserPlus} size={96} />
              <Text variant="body" color="textSecondary" align="center">
                {tr(
                  'Search by @handle or email address. People under 18 can only be found by people they already know.',
                )}
              </Text>
              <View
                style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
              >
                <Button
                  label={tr('Invite someone')}
                  icon={UserPlus}
                  onPress={() => setInviting(true)}
                  testID="connect-invite"
                />
                <Button
                  label={tr('Share @{handle}', { handle: me.handle })}
                  variant="secondary"
                  onPress={shareHandle}
                />
              </View>
            </View>
          )
        }
      />
      {inviting ? <InviteSheet open onClose={() => setInviting(false)} /> : null}
      {target ? (
        <ConnectSheet
          open
          onClose={() => setTarget(null)}
          person={target}
          onSent={() => void results.refetch()}
        />
      ) : null}
    </Screen>
  );
}
