import type { Sphere } from '@caishy/core/taxonomy';
import { View } from 'react-native';
import { useConnections } from '@/api/hooks';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { Check } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';

/** Someone who can be picked, as the picker shows them. */
export interface Pickable {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  relationship: { label: string; sphere: Sphere } | null;
}

/**
 * Choose people you're connected with (groups and spaces take nobody else, PRD §55), or, with
 * `among`, from those given (a space's conversations take its people). `exclude` leaves out who
 * is already there.
 */
export function PeoplePicker({
  picked,
  onToggle,
  exclude,
  among,
}: {
  picked: ReadonlySet<string>;
  onToggle: (userId: string) => void;
  exclude?: ReadonlySet<string>;
  /** Pick from these instead; `people` is undefined while they load. */
  among?: { people: Pickable[] | undefined; empty: string };
}) {
  const t = useTheme();
  const connections = useConnections();
  const everyone: Pickable[] = among
    ? (among.people ?? [])
    : (connections.data?.connections ?? []).map((c) => ({
        id: c.person.id,
        displayName: c.nickname ?? c.person.displayName,
        handle: c.person.handle,
        avatarUrl: c.person.avatarUrl,
        relationship: c.relationships[0] ?? null,
      }));
  const list = everyone.filter((p) => !exclude?.has(p.id));
  if (among ? among.people === undefined : connections.isPending)
    return (
      <Text variant="body" color="textSecondary">
        Loading your people…
      </Text>
    );
  if (list.length === 0)
    return (
      <Text variant="body" color="textSecondary">
        {among
          ? among.empty
          : exclude?.size
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
      {list.map((p) => {
        const on = picked.has(p.id);
        return (
          <ListRow
            key={p.id}
            checked={on}
            testID={`pick-${p.handle}`}
            left={<Avatar id={p.id} name={p.displayName} url={p.avatarUrl} size={36} />}
            title={p.displayName}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {p.relationship ? (
                  <RelationshipChip label={p.relationship.label} sphere={p.relationship.sphere} />
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
            onPress={() => onToggle(p.id)}
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
