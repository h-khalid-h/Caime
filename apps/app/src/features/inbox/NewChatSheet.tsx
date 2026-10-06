import { tr } from '@caime/core/i18n';
import { CAI_ID, CAISHY_ID } from '@caime/core/system-ids';
import { router } from 'expo-router';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Search from 'lucide-react-native/icons/search';
import UserPlus from 'lucide-react-native/icons/user-plus';
import Users from 'lucide-react-native/icons/users';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useConnections } from '@/api/hooks';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { openChatWith, openDirectWith } from './openChat';

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
    <Sheet open={open} onClose={onClose} title={tr('New conversation')}>
      <TextField
        icon={Search}
        placeholder={tr('Search your people')}
        value={term}
        onChangeText={setTerm}
        autoFocus
      />
      <View style={{ marginHorizontal: -20 }}>
        <ListRow
          icon={UserPlus}
          title={tr('Connect with someone new')}
          subtitle={tr('Find people by @handle or email')}
          onPress={() => {
            onClose();
            router.push('/connect');
          }}
          chevron
        />
        <ListRow
          icon={Users}
          title={tr('New group')}
          onPress={() => {
            onClose();
            router.push('/new-group');
          }}
          chevron
        />
        <ListRow
          icon={LayoutGrid}
          title={tr('Start a space')}
          subtitle={tr('For a family, a team, a project or a club')}
          onPress={() => {
            onClose();
            router.push('/new-space');
          }}
          chevron
          testID="new-space-from-chats"
        />
        <ListRow
          left={<Avatar id={CAI_ID} name="Cai" size={40} />}
          title={tr('Chat with Cai')}
          subtitle={tr('What’s waiting, what’s asked of you, what’s next')}
          onPress={() => {
            onClose();
            void openDirectWith(CAI_ID);
          }}
          testID="new-chat-cai"
        />
        <ListRow
          left={<Avatar id={CAISHY_ID} name="Caishy" size={40} />}
          title={tr('Caime Friends')}
          subtitle={tr('Seven characters, each with a few tips')}
          onPress={() => {
            onClose();
            router.push({ pathname: '/p/[id]', params: { id: CAISHY_ID } });
          }}
          chevron
          testID="new-chat-friends"
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
            {term ? tr('No one by that name yet.') : tr('Your connections will show here.')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
