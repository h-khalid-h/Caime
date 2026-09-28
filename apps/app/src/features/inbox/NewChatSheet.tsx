import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useConnections } from '@/api/hooks';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { Search, UserPlus, Users } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { openChatWith } from './openChat';

export function NewChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connections = useConnections();
  const [term, setTerm] = useState('');
  const list = useMemo(() => {
    const all = connections.data?.connections ?? [];
    const q = term.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.person.displayName.toLowerCase().includes(q) ||
        c.person.handle.toLowerCase().includes(q.replace(/^@/, '')) ||
        c.relationships.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [connections.data, term]);
  return (
    <Sheet open={open} onClose={onClose} title="New conversation">
      <TextField
        icon={Search}
        placeholder="Search your people"
        value={term}
        onChangeText={setTerm}
        autoFocus
      />
      <View style={{ marginHorizontal: -20 }}>
        <ListRow
          icon={UserPlus}
          title="Connect with someone new"
          subtitle="Find people by @handle or email"
          onPress={() => {
            onClose();
            router.push('/connect');
          }}
          chevron
        />
        <ListRow
          icon={Users}
          title="New group"
          onPress={() => {
            onClose();
            router.push('/new-group');
          }}
          chevron
        />
        {list.map((c) => (
          <ListRow
            key={c.connectionId}
            left={
              <Avatar
                id={c.person.id}
                name={c.person.displayName}
                url={c.person.avatarUrl}
                size={40}
              />
            }
            title={c.nickname ?? c.person.displayName}
            subtitle={`@${c.person.handle}`}
            right={
              c.relationships[0] ? (
                <RelationshipChip
                  label={c.relationships[0].label}
                  sphere={c.relationships[0].sphere}
                />
              ) : null
            }
            onPress={() => {
              onClose();
              void openChatWith(c);
            }}
          />
        ))}
        {connections.data && list.length === 0 ? (
          <Text variant="body" color="textSecondary" style={{ padding: 20 }}>
            {term ? 'No one by that name yet.' : 'Your connections will show here.'}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
