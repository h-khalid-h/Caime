import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useConnections } from '@/api/hooks';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Check } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export default function NewGroup() {
  const t = useTheme();
  const { desktop } = useLayout();
  const connections = useConnections();
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
        <View
          style={{
            backgroundColor: t.c.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.c.border,
            overflow: 'hidden',
          }}
        >
          {(connections.data?.connections ?? []).map((c) => {
            const on = picked.has(c.person.id);
            return (
              <ListRow
                key={c.connectionId}
                left={
                  <Avatar
                    id={c.person.id}
                    name={c.person.displayName}
                    url={c.person.avatarUrl}
                    size={36}
                  />
                }
                title={c.nickname ?? c.person.displayName}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {c.relationships[0] ? (
                      <RelationshipChip
                        label={c.relationships[0].label}
                        sphere={c.relationships[0].sphere}
                      />
                    ) : null}
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: on ? t.c.primary : t.c.borderStrong,
                        backgroundColor: on ? t.c.primary : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {on ? <Check size={14} color={t.c.onPrimary} strokeWidth={3} /> : null}
                    </View>
                  </View>
                }
                onPress={() =>
                  setPicked((p) => {
                    const next = new Set(p);
                    if (next.has(c.person.id)) next.delete(c.person.id);
                    else next.add(c.person.id);
                    return next;
                  })
                }
              />
            );
          })}
        </View>
        <Button label="Create group" size="lg" block onPress={create} loading={busy} />
      </ScrollView>
    </Screen>
  );
}
