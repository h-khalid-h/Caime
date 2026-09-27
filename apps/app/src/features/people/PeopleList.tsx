import type { ConnectionView } from '@caishy/core/api';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caishy/core/taxonomy';
import { router, usePathname } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { useConnections, useRequests } from '@/api/hooks';
import { useLive } from '@/state/live';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip, RelationshipChip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ChevronRight, Phone, Search, UserPlus } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

type Filter = Sphere | 'all' | 'unlabelled';

function PersonRow({ c, selected }: { c: ConnectionView; selected: boolean }) {
  const t = useTheme();
  const presence = useLive((s) => s.presence[c.person.id]);
  const primary = c.relationships.find((r) => r.isPrimary) ?? c.relationships[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[c.nickname ?? c.person.displayName, primary?.label]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.navigate({ pathname: '/p/[id]', params: { id: c.person.id } })}
      focusRadius={12}
    >
      {({ hovered, pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 9,
            marginHorizontal: 6,
            borderRadius: 14,
            backgroundColor:
              selected || pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : 'transparent',
          }}
        >
          <Avatar
            id={c.person.id}
            name={c.person.displayName}
            url={c.person.avatarUrl}
            size={46}
            presence={presence ?? c.person.presence}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text variant="bodyStrong" numberOfLines={1} auto>
              {c.nickname ?? c.person.displayName}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {c.relationships.length ? (
                c.relationships
                  .slice(0, 2)
                  .map((r) => <RelationshipChip key={r.id} label={r.label} sphere={r.sphere} />)
              ) : (
                <Text variant="caption" color="textTertiary">
                  @{c.person.handle} · add how you know them
                </Text>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function PeopleList({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/p/') ? pathname.slice(3) : null;
  const q = useConnections();
  const requests = useRequests('incoming');
  const [filter, setFilter] = useState<Filter>('all');
  const [term, setTerm] = useState('');
  const all = q.data?.connections ?? [];

  const counts = useMemo(() => {
    const out: Partial<Record<Filter, number>> = { all: all.length, unlabelled: 0 };
    for (const c of all) {
      if (c.relationships.length === 0) out.unlabelled = (out.unlabelled ?? 0) + 1;
      for (const s of new Set(c.relationships.map((r) => r.sphere))) out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }, [all]);

  const sections = useMemo(() => {
    const needle = term.trim().toLowerCase().replace(/^@/, '');
    const matches = all.filter((c) => {
      if (filter === 'unlabelled' && c.relationships.length) return false;
      if (
        filter !== 'all' &&
        filter !== 'unlabelled' &&
        !c.relationships.some((r) => r.sphere === filter)
      )
        return false;
      if (!needle) return true;
      return (
        c.person.displayName.toLowerCase().includes(needle) ||
        (c.nickname ?? '').toLowerCase().includes(needle) ||
        c.person.handle.includes(needle) ||
        c.relationships.some((r) => r.label.toLowerCase().includes(needle))
      );
    });
    if (filter !== 'all' || needle) return matches.length ? [{ title: '', data: matches }] : [];
    // Grouped by how you know them, in the taxonomy's order.
    const bySphere = new Map<string, ConnectionView[]>();
    for (const c of matches) {
      const s =
        (c.relationships.find((r) => r.isPrimary) ?? c.relationships[0])?.sphere ?? 'unlabelled';
      bySphere.set(s, [...(bySphere.get(s) ?? []), c]);
    }
    const order = [...SPHERES, 'unlabelled'];
    return order
      .filter((s) => bySphere.has(s))
      .map((s) => ({
        title: s === 'unlabelled' ? 'Not labelled yet' : SPHERE_DEFS[s as Sphere].plural,
        data: bySphere.get(s) ?? [],
      }));
  }, [all, filter, term]);

  const chips: Filter[] = [
    'all',
    ...SPHERES.filter((s) => counts[s]),
    ...(counts.unlabelled ? (['unlabelled'] as const) : []),
  ];
  const incoming = requests.data?.requests.length ?? 0;

  const header = (
    <View>
      <PageHeader
        title="People"
        subtitle={all.length ? `${all.length} connection${all.length === 1 ? '' : 's'}` : null}
        right={
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <IconButton
              icon={Phone}
              label="Calls"
              onPress={() => router.push('/calls')}
              testID="people-calls"
            />
            <IconButton
              icon={UserPlus}
              label="Connect with someone"
              onPress={() => router.push('/connect')}
              testID="people-connect"
            />
          </View>
        }
      />
      {incoming ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/requests')}
          style={{
            marginHorizontal: 16,
            marginBottom: 10,
            padding: 14,
            borderRadius: 16,
            backgroundColor: t.c.accentSoft,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text
            variant="bodyStrong"
            color={t.scheme === 'dark' ? 'text' : 'accentStrong'}
            style={{ flex: 1 }}
          >
            {incoming === 1 ? '1 person wants to connect' : `${incoming} people want to connect`}
          </Text>
          <ChevronRight size={18} color={t.c.accentStrong} />
        </Pressable>
      ) : null}
      {all.length > 6 ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TextField
            icon={Search}
            placeholder="Search your people"
            value={term}
            onChangeText={setTerm}
            accessibilityLabel="Search your people"
          />
        </View>
      ) : null}
      {all.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
        >
          {chips.map((f) => (
            <Chip
              key={f}
              label={`${f === 'all' ? 'Everyone' : f === 'unlabelled' ? 'Not labelled' : SPHERE_DEFS[f].plural}${counts[f] ? ` ${counts[f]}` : ''}`}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const content =
    q.isPending && !q.data ? (
      <>
        {header}
        <SkeletonRows />
      </>
    ) : all.length === 0 ? (
      <ScrollView>
        {header}
        <EmptyState
          character="niko"
          expression="happy"
          icon={UserPlus}
          title="Find your people"
          body="Connect by @handle or email. When you add someone, tell Caishy how you know them: that’s what makes everything else work."
          action={
            <Button
              label="Connect with someone"
              icon={UserPlus}
              onPress={() => router.push('/connect')}
            />
          }
        />
      </ScrollView>
    ) : (
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.connectionId}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text
              variant="overline"
              color="textTertiary"
              style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 }}
              accessibilityRole="header"
            >
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <PersonRow c={item} selected={Boolean(pane && selectedId === item.person.id)} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text variant="body" color="textSecondary" style={{ padding: 24 }} align="center">
            No one matches.
          </Text>
        }
      />
    );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
