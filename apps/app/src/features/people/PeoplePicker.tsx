import { View } from 'react-native';
import { useConnections } from '@/api/hooks';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { Check } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';

/**
 * Choose people you're connected with (groups and spaces take nobody else, PRD §55). `exclude`
 * leaves out who is already there.
 */
export function PeoplePicker({
  picked,
  onToggle,
  exclude,
}: {
  picked: ReadonlySet<string>;
  onToggle: (userId: string) => void;
  exclude?: ReadonlySet<string>;
}) {
  const t = useTheme();
  const connections = useConnections();
  const list = (connections.data?.connections ?? []).filter((c) => !exclude?.has(c.person.id));
  if (connections.isPending)
    return (
      <Text variant="body" color="textSecondary">
        Loading your people…
      </Text>
    );
  if (list.length === 0)
    return (
      <Text variant="body" color="textSecondary">
        {exclude?.size
          ? 'Everyone you’re connected with is already here.'
          : 'Connect with people first, then add them here.'}
      </Text>
    );
  return (
    <View
      style={{
        backgroundColor: t.c.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.c.border,
        overflow: 'hidden',
      }}
    >
      {list.map((c) => {
        const on = picked.has(c.person.id);
        return (
          <ListRow
            key={c.connectionId}
            checked={on}
            testID={`pick-${c.person.handle}`}
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
            onPress={() => onToggle(c.person.id)}
          />
        );
      })}
    </View>
  );
}

/** A set-toggling helper for pickers. */
export function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
