import { tr } from '@caime/core/i18n';
import { SYSTEM_ACCOUNTS, systemAccountOf } from '@caime/core/system-accounts';
import { router } from 'expo-router';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { openDirectWith } from '@/features/inbox/openChat';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Back } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * Cai's or a Caime Friend's page (R67): what it is, what it's for, and Message. Nothing to
 * connect with, label or call; drawn from core, so it asks the server nothing until it's written to.
 */
export function SystemProfile({ id }: { id: string }) {
  const account = systemAccountOf(id);
  const { desktop } = useLayout();
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const message = async () => {
    setBusy(true);
    await openDirectWith(id);
    setBusy(false);
  };
  const friends = SYSTEM_ACCOUNTS.filter((a) => a.kind === 'character' && a.id !== id);
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          desktop ? null : (
            <IconButton
              icon={Back}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
            />
          )
        }
        title={desktop ? '' : account.name}
        border={false}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
          gap: 16,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View style={{ alignItems: 'center', gap: 8 }} testID="system-profile">
          <Avatar id={id} name={account.name} size={104} />
          <Text variant="title" align="center">
            {account.name}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {`@${account.handle}`}
          </Text>
          <Text variant="body" align="center">
            {tr(account.about)}
          </Text>
          <Text variant="caption" color="textTertiary" align="center">
            {account.kind === 'assistant'
              ? tr('This is Cai, Caime’s own AI assistant, not a person.')
              : tr(
                  'This is one of Caime’s friends: not a person. It answers by its rules and, with AI assist on, with a model’s help, in its own character.',
                )}
          </Text>
        </View>
        <Button
          label={tr('Message')}
          icon={MessageCircle}
          size="lg"
          block
          loading={busy}
          onPress={() => void message()}
          testID="person-message"
        />
        <View style={{ gap: 8 }}>
          <Text variant="overline" color="textSecondary">
            {tr('Caime Friends')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {friends.map((f) => (
              <Pressable
                key={f.id}
                accessibilityRole="link"
                accessibilityLabel={f.name}
                onPress={() => router.navigate({ pathname: '/p/[id]', params: { id: f.id } })}
                style={{ alignItems: 'center', gap: 4, width: 64 }}
              >
                <Avatar id={f.id} name={f.name} size={48} />
                <Text variant="caption" numberOfLines={1}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
