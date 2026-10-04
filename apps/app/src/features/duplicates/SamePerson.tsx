/**
 * Two of someone's connections who may be one person (PRD §51): offered in People, never done
 * for them (R12). Merged, one shows under the other in their People; both accounts and their
 * conversations stay, and either can be separated again. Loaded only when there's one to show
 * (./index.tsx).
 */
import type { ConnectionView, SuggestionView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { surenessLine } from '@caime/core/sureness';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useConnections, useDuplicates } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { Users } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of [qk.connections, qk.duplicates, ['person'], ['suggestions']])
      void qc.invalidateQueries({ queryKey: key });
  };
}

const shownName = (c: ConnectionView | undefined) => c?.nickname ?? c?.person.displayName ?? '';

function Offer({ s, all }: { s: SuggestionView; all: ConnectionView[] }) {
  const t = useTheme();
  const refresh = useRefresh();
  const [busy, setBusy] = useState<'merge' | 'separate' | null>(null);
  const keep = all.find((c) => c.person.id === s.payload.keep);
  const merge = all.find((c) => c.person.id === s.payload.merge);
  if (!keep || !merge) return null;
  const run = async (what: 'merge' | 'separate') => {
    setBusy(what);
    try {
      if (what === 'merge') {
        await endpoints.acceptSuggestion(s.id, { keep: keep.person.id });
        toast(
          tr('Merged: {shownName} is one person in People now', { shownName: shownName(keep) }),
        );
      } else {
        await endpoints.dismissSuggestion(s.id);
        toast(tr('Kept separate. We won’t ask about them again.'));
      }
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 12 }} testID="duplicate-offer">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <Avatar
            id={keep.person.id}
            name={keep.person.displayName}
            url={keep.person.avatarUrl}
            size={36}
          />
          <View
            style={{
              marginStart: -12,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: t.c.surface,
            }}
          >
            <Avatar
              id={merge.person.id}
              name={merge.person.displayName}
              url={merge.person.avatarUrl}
              size={36}
            />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong">{s.title}</Text>
          <Text variant="caption" color="textSecondary">
            {tr('@{handle} and @{handle2}', {
              handle: keep.person.handle,
              handle2: merge.person.handle,
            })}
          </Text>
        </View>
      </View>
      <Text variant="caption" color="textSecondary" testID="suggestion-sure">
        {surenessLine(s.confidence, s.rationale)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={tr('Merge')}
          size="sm"
          loading={busy === 'merge'}
          disabled={busy !== null}
          onPress={() => void run('merge')}
          testID="duplicate-merge"
        />
        <Button
          label={tr('Keep separate')}
          size="sm"
          variant="secondary"
          loading={busy === 'separate'}
          disabled={busy !== null}
          onPress={() => void run('separate')}
          testID="duplicate-separate"
        />
      </View>
    </View>
  );
}

/** At the top of People: who may be the same person, to merge or keep apart. */
export function DuplicateOffers({ all }: { all: ConnectionView[] }) {
  const q = useDuplicates();
  const offers = (q.data?.suggestions ?? []).filter(
    (s) =>
      all.some((c) => c.person.id === s.payload.keep) &&
      all.some((c) => c.person.id === s.payload.merge),
  );
  if (!offers.length) return null;
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
      <Card>
        <View style={{ gap: 14 }}>
          {offers.slice(0, 3).map((s, i) => (
            <View key={s.id} style={{ gap: 14 }}>
              {i > 0 ? <Divider /> : null}
              <Offer s={s} all={all} />
            </View>
          ))}
          {offers.length > 3 ? (
            <Text variant="caption" color="textTertiary">
              {tr('{length} more after these.', { length: offers.length - 3 })}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

/** On someone's page: the other accounts they are in People, or the one they show under. */
export function OtherAccounts({ personId, name }: { personId: string; name: string }) {
  const t = useTheme();
  const q = useConnections();
  const refresh = useRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  const all = q.data?.connections ?? [];
  const mine = all.find((c) => c.person.id === personId);
  if (!mine) return null;
  const separate = async (connectionId: string, who: string) => {
    setBusy(connectionId);
    try {
      await endpoints.separateConnection(connectionId);
      toast(tr('Separated: {who} is on their own in People again', { who }));
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  if (mine.mergedInto) {
    const under = all.find((c) => c.person.id === mine.mergedInto);
    return (
      <Card>
        <View style={{ gap: 10 }} testID="shown-under">
          <Text variant="body">
            {tr('In People, {name} is one person with {shownName}.', {
              name,
              shownName: shownName(under),
            })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              label={tr('See {shownName}', { shownName: shownName(under) })}
              size="sm"
              variant="secondary"
              onPress={() =>
                router.navigate({ pathname: '/p/[id]', params: { id: mine.mergedInto ?? '' } })
              }
            />
            <Button
              label={tr('Separate')}
              size="sm"
              variant="ghost"
              loading={busy === mine.connectionId}
              onPress={() => void separate(mine.connectionId, name)}
              testID="separate-self"
            />
          </View>
        </View>
      </Card>
    );
  }
  if (!mine.also?.length) return null;
  return (
    <Card padded={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <Text variant="label">
          {mine.also.length === 1 ? tr('Also this account') : tr('Also these accounts')}
        </Text>
      </View>
      {mine.also.map((a, i) => (
        <View key={a.connectionId} testID="other-account">
          {i > 0 ? <Divider inset={64} /> : null}
          {/* Open and Separate side by side, each its own control: never one inside the other. */}
          <ListRow
            left={
              <Avatar
                id={a.person.id}
                name={a.person.displayName}
                url={a.person.avatarUrl}
                size={36}
              />
            }
            title={a.person.displayName}
            subtitle={`@${a.person.handle}`}
            right={
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                <Button
                  label={tr('Open')}
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    router.navigate({ pathname: '/p/[id]', params: { id: a.person.id } })
                  }
                  testID="open-account"
                />
                <Button
                  label={tr('Separate')}
                  size="sm"
                  variant="ghost"
                  loading={busy === a.connectionId}
                  onPress={() => void separate(a.connectionId, a.person.displayName)}
                  testID="separate-account"
                />
              </View>
            }
          />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 6, padding: 16, paddingTop: 6 }}>
        <Users size={12} color={t.c.textTertiary} />
        <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
          {tr('Only you see them as one. Each account keeps its own conversations.')}
        </Text>
      </View>
    </Card>
  );
}
