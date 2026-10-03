import type { ConnectionView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { useConnections, useRequests } from '@/api/hooks';
import { DuplicateOffers } from '@/features/duplicates';
import { RelationshipOffers } from '@/features/relationships/offers';
import { YouButton } from '@/features/shell/YouButton';
import { useLive } from '@/state/live';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ChoiceChips, RelationshipChip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ChevronRight, Phone, Search, UserPlus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

type Filter = Sphere | 'all' | 'unlabelled';

function PersonRow({
  c,
  selected,
  relationships,
}: {
  c: ConnectionView;
  selected: boolean;
  /** How they're known, across every account of theirs merged into this one (PRD §51). */
  relationships: ConnectionView['relationships'];
}) {
  const t = useTheme();
  const presence = useLive((s) => s.presence[c.person.id]);
  const primary = relationships.find((r) => r.isPrimary) ?? relationships[0];
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
              {relationships.length ? (
                relationships
                  .slice(0, 2)
                  .map((r) => <RelationshipChip key={r.id} label={r.label} sphere={r.sphere} />)
              ) : (
                <Text variant="caption" color="textTertiary">
                  {tr('@{handle} · add how you know them', { handle: c.person.handle })}
                </Text>
              )}
              {c.also?.length ? (
                <Text variant="caption" color="textTertiary">
                  {tr('{length} accounts', { length: c.also.length + 1 })}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function PeopleList({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const { desktop } = useLayout();
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/p/') ? pathname.slice(3) : null;
  const q = useConnections();
  const requests = useRequests('incoming');
  const [filter, setFilter] = useState<Filter>('all');
  const [term, setTerm] = useState('');
  const all = q.data?.connections ?? [];
  // One row a person: accounts merged into another (PRD §51) show under it, and count with it.
  const { people, accountsOf } = useMemo(() => {
    const byId = new Map(all.map((c) => [c.person.id, c]));
    const accounts = new Map(
      all.map((c) => [
        c.connectionId,
        [c, ...(c.also ?? []).flatMap((a) => byId.get(a.person.id) ?? [])] as ConnectionView[],
      ]),
    );
    return {
      people: all.filter((c) => !c.mergedInto),
      accountsOf: (c: ConnectionView) => accounts.get(c.connectionId) ?? [c],
    };
  }, [all]);
  // One person's labels, whichever of their accounts has them: each once, the main one's first.
  const relationshipsOf = (c: ConnectionView) => {
    const seen = new Set<string>();
    return accountsOf(c)
      .flatMap((a) => a.relationships)
      .filter((r) => {
        const key = `${r.sphere}|${r.label.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const counts = useMemo(() => {
    const out: Partial<Record<Filter, number>> = { all: people.length, unlabelled: 0 };
    for (const c of people) {
      const rels = accountsOf(c).flatMap((a) => a.relationships);
      if (rels.length === 0) out.unlabelled = (out.unlabelled ?? 0) + 1;
      for (const s of new Set(rels.map((r) => r.sphere))) out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }, [people, accountsOf]);
  const chips: Filter[] = [
    'all',
    ...SPHERES.filter((s) => counts[s]),
    ...(counts.unlabelled ? (['unlabelled'] as const) : []),
  ];
  // One whose last person went (labelled otherwise, say) lists everyone again, and stays so.
  const gone = !chips.includes(filter);
  useEffect(() => {
    if (gone && q.data) setFilter('all');
  }, [gone, q.data]);
  const shown: Filter = gone ? 'all' : filter;

  const sections = useMemo(() => {
    const needle = term.trim().toLowerCase().replace(/^@/, '');
    const matches = people.filter((c) => {
      const accounts = accountsOf(c);
      const rels = accounts.flatMap((a) => a.relationships);
      if (shown === 'unlabelled' && rels.length) return false;
      if (shown !== 'all' && shown !== 'unlabelled' && !rels.some((r) => r.sphere === shown))
        return false;
      if (!needle) return true;
      return (
        accounts.some(
          (a) =>
            a.person.displayName.toLowerCase().includes(needle) ||
            (a.nickname ?? '').toLowerCase().includes(needle) ||
            a.person.handle.includes(needle),
        ) || rels.some((r) => r.label.toLowerCase().includes(needle))
      );
    });
    if (shown !== 'all' || needle) return matches.length ? [{ title: '', data: matches }] : [];
    // Grouped by how you know them, in the taxonomy's order.
    const bySphere = new Map<string, ConnectionView[]>();
    for (const c of matches) {
      const rels = accountsOf(c).flatMap((a) => a.relationships);
      const s = (rels.find((r) => r.isPrimary) ?? rels[0])?.sphere ?? 'unlabelled';
      bySphere.set(s, [...(bySphere.get(s) ?? []), c]);
    }
    const order = [...SPHERES, 'unlabelled'];
    return order
      .filter((s) => bySphere.has(s))
      .map((s) => ({
        title: s === 'unlabelled' ? tr('Not labelled yet') : tr(SPHERE_DEFS[s as Sphere].plural),
        data: bySphere.get(s) ?? [],
      }));
  }, [people, accountsOf, shown, term]);

  const incoming = requests.data?.requests.length ?? 0;

  const header = (
    <View>
      <PageHeader
        title={tr('People')}
        subtitle={people.length ? trn(people.length, '{n} connection', '{n} connections') : null}
        left={desktop ? undefined : <YouButton />}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton
              icon={Phone}
              label={tr('Calls')}
              filled
              onPress={() => router.push('/calls')}
              testID="people-calls"
            />
            <IconButton
              icon={UserPlus}
              label={tr('Connect with someone')}
              tone="primary"
              size={20}
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
            {incoming === 1
              ? '1 person wants to connect'
              : tr('{incoming} people want to connect', { incoming })}
          </Text>
          <ChevronRight size={18} color={t.c.accentStrong} />
        </Pressable>
      ) : null}
      <DuplicateOffers all={all} />
      <RelationshipOffers all={all} />
      {people.length > 6 ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TextField
            icon={Search}
            placeholder={tr('Search your people')}
            value={term}
            onChangeText={setTerm}
            accessibilityLabel={tr('Search your people')}
          />
        </View>
      ) : null}
      {all.length ? (
        <ChoiceChips<Filter>
          label={tr('Show people')}
          value={shown}
          onChange={setFilter}
          wrap={desktop}
          options={chips.map((f) => ({
            value: f,
            label: `${f === 'all' ? 'Everyone' : f === 'unlabelled' ? 'Not labelled' : tr(SPHERE_DEFS[f].plural)}${counts[f] ? ` ${counts[f]}` : ''}`,
          }))}
        />
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
          title={tr('Find your people')}
          body={tr(
            'Connect by @handle or email. When you add someone, tell Caime how you know them: that’s what makes everything else work.',
          )}
          action={
            <Button
              label={tr('Connect with someone')}
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
          <PersonRow
            c={item}
            relationships={relationshipsOf(item)}
            selected={Boolean(
              pane && selectedId && accountsOf(item).some((a) => a.person.id === selectedId),
            )}
          />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text variant="body" color="textSecondary" style={{ padding: 24 }} align="center">
            {tr('No one matches.')}
          </Text>
        }
      />
    );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
