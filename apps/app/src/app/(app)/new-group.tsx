import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { privateSupported } from '@/features/e2ee/support';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export default function NewGroup() {
  const { desktop } = useLayout();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [privacy, setPrivacy] = useState<'standard' | 'private'>('standard');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim() || picked.size === 0) {
      toast(tr('Name the group and add at least one person.'));
      return;
    }
    setBusy(true);
    try {
      const { conversation } = await endpoints.createGroup(
        title.trim(),
        [...picked],
        purpose.trim() || undefined,
        { private: privacy === 'private' },
      );
      router.replace({ pathname: '/c/[id]', params: { id: conversation.id } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label={tr('Back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        }
        title={tr('New group')}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <TextField
          label={tr('Group name')}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={tr('Weekend hikers, Q3 launch…')}
        />
        <TextField
          label={tr('What it’s for (optional)')}
          value={purpose}
          onChangeText={setPurpose}
          maxLength={200}
        />
        {privateSupported ? (
          <>
            <Segmented
              label={tr('What kind of group')}
              value={privacy}
              onChange={setPrivacy}
              options={[
                { value: 'standard', label: tr('Standard') },
                { value: 'private', label: tr('Private') },
              ]}
            />
            <Text variant="caption" color="textSecondary">
              {privacy === 'private'
                ? tr(
                    'End to end encrypted: only the devices of the people in it can read it, so there’s no search, Caime AI or previews, and it’s text for now.',
                  )
                : tr('Search, suggestions and Caime AI work here.')}
            </Text>
          </>
        ) : null}
        <Text variant="overline" color="textTertiary">
          {tr('People · {size} chosen', { size: picked.size })}
        </Text>
        <PeoplePicker picked={picked} onToggle={(id) => setPicked((p) => toggled(p, id))} />
        <Button label={tr('Create group')} size="lg" block onPress={create} loading={busy} />
      </ScrollView>
    </Screen>
  );
}
