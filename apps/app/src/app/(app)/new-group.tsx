import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export default function NewGroup() {
  const { desktop } = useLayout();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim() || picked.size === 0) {
      toast('Name the group and add at least one person.');
      return;
    }
    setBusy(true);
    try {
      const { conversation } = await endpoints.createGroup(
        title.trim(),
        [...picked],
        purpose.trim() || undefined,
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
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        }
        title="New group"
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
          label="Group name"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder="Weekend hikers, Q3 launch…"
        />
        <TextField
          label="What it’s for (optional)"
          value={purpose}
          onChangeText={setPurpose}
          maxLength={200}
        />
        <Text variant="overline" color="textTertiary">
          People · {picked.size} chosen
        </Text>
        <PeoplePicker picked={picked} onToggle={(id) => setPicked((p) => toggled(p, id))} />
        <Button label="Create group" size="lg" block onPress={create} loading={busy} />
      </ScrollView>
    </Screen>
  );
}
