import { SPACE_KIND_DEFS, SPACE_KINDS, type SpaceKind } from '@caime/core/spaces';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { SPACE_ICONS } from '@/features/spaces/kinds';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** Start a space (PRD §40): what it's called, what kind, and who's in it to begin with. */
export default function NewSpace() {
  const { desktop } = useLayout();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SpaceKind | null>(null);
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast('Give the space a name.');
    if (!kind) return toast('Choose what kind of space it is.');
    setBusy(true);
    try {
      const { space } = await endpoints.createSpace({
        name: name.trim(),
        kind,
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        memberIds: [...picked],
      });
      qc.setQueryData(qk.space(space.id), { space });
      void qc.invalidateQueries({ queryKey: qk.spaces });
      router.replace({ pathname: '/s/[id]', params: { id: space.id } });
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
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/spaces'))}
          />
        }
        title="New space"
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          placeholder="The Haddads, Design team, Book club…"
          testID="space-name"
        />
        <View style={{ gap: 8 }}>
          <Text variant="label">What kind of space</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPACE_KINDS.map((k) => (
              <Chip
                key={k}
                label={SPACE_KIND_DEFS[k].label}
                icon={SPACE_ICONS[k]}
                selected={kind === k}
                onPress={() => setKind(k)}
                testID={`space-kind-${k}`}
              />
            ))}
          </View>
          <Text variant="caption" color="textSecondary">
            {kind
              ? `${SPACE_KIND_DEFS[kind].hint}. Its conversations offer the cards that fit it.`
              : 'It decides which cards its conversations offer.'}
          </Text>
        </View>
        <TextField
          label="What it’s for (optional)"
          value={purpose}
          onChangeText={setPurpose}
          maxLength={280}
        />
        <Text variant="overline" color="textTertiary">
          People · {picked.size} chosen
        </Text>
        <PeoplePicker picked={picked} onToggle={(id) => setPicked((p) => toggled(p, id))} />
        <Text variant="caption" color="textSecondary">
          You can add people later too. Everyone in the space is in its General conversation.
        </Text>
        <Button
          label="Start the space"
          size="lg"
          block
          onPress={() => void create()}
          loading={busy}
          testID="space-create"
        />
      </ScrollView>
    </Screen>
  );
}
