import type { PeopleSearchResult } from '@caishy/core/api';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Share, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openChatWith } from '@/features/inbox/NewChatSheet';
import { ConnectSheet } from '@/features/people/ConnectSheet';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { Guide } from '@/ui/Guide';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Search, UserPlus } from '@/ui/icons';
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

export default function Connect() {
  const t = useTheme();
  const me = useMe();
  const { desktop } = useLayout();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term.trim());
  const [target, setTarget] = useState<PeopleSearchResult['person'] | null>(null);
  const results = useQuery({
    queryKey: qk.peopleSearch(debounced),
    queryFn: () => endpoints.searchPeople(debounced),
    enabled: debounced.length >= 2,
  });

  const renderItem = ({ item }: { item: PeopleSearchResult }) => {
    const state = item.connection.state;
    const action =
      state === 'connected' ? (
        <Button
          label="Message"
          size="sm"
          variant="secondary"
          onPress={() => void openChatWith({ conversationId: null, person: item.person })}
        />
      ) : state === 'outgoing' ? (
        <Text variant="captionStrong" color="textTertiary">
          Requested
        </Text>
      ) : state === 'incoming' ? (
        <Button
          label="Respond"
          size="sm"
          onPress={() => router.push({ pathname: '/p/[id]', params: { id: item.person.id } })}
        />
      ) : item.person.id === me.id ? (
        <Text variant="captionStrong" color="textTertiary">
          You
        </Text>
      ) : (
        <Button
          label="Connect"
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
    void Share.share({
      message: `I’m on Caishy as @${me.handle}. Find me there: https://caishy.app/@${me.handle}`,
    }).catch(() => {});

  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
          />
        }
        title="Connect"
      />
      <View style={{ padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <TextField
          icon={Search}
          placeholder="@handle, name or email"
          value={term}
          onChangeText={setTerm}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Find people"
          testID="connect-search"
        />
      </View>
      <FlatList
        data={debounced.length >= 2 ? (results.data?.results ?? []) : []}
        keyExtractor={(r) => r.person.id}
        renderItem={renderItem}
        style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          debounced.length >= 2 && results.isFetched ? (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text variant="body" color="textSecondary" align="center">
                No one found for “{debounced}”. They may not be on Caishy yet, or they keep their
                profile private.
              </Text>
              <Button label="Invite them" variant="secondary" onPress={shareHandle} />
            </View>
          ) : (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Guide character="pico" expression="curious" icon={UserPlus} size={96} />
              <Text variant="body" color="textSecondary" align="center">
                Search by @handle or email address. People under 18 can only be found by people they
                already know.
              </Text>
              <Button label={`Share @${me.handle}`} variant="secondary" onPress={shareHandle} />
            </View>
          )
        }
      />
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
