/**
 * An organization's updates on its page (PRD §59): anyone reads them; following puts them in
 * Updates (and, if they ask, a notification for each); its owner and admins post, change and take
 * them back. Kept apart from conversations: a follower is never in one because of it, and nobody
 * sees who else follows.
 */
import type { OrgUpdateView, OrgView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { UPDATE_MAX } from '@caishy/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useOrgUpdates } from '@/api/hooks';
import { qk } from '@/api/keys';
import { linkify, openCheckedLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
import { Bell, BellOff, Pencil, Trash } from '@/ui/icons';
import { SectionTitle } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

function Body({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Text variant="body" selectable auto={text}>
      {linkify(text).map((part) =>
        part.url ? (
          <Text
            key={part.start}
            variant="body"
            color={t.c.link}
            style={{ textDecorationLine: 'underline' }}
            onPress={() => void openCheckedLink(part.url ?? '')}
            accessibilityRole="link"
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function Update({
  u,
  canPost,
  onChanged,
}: {
  u: OrgUpdateView;
  canPost: boolean;
  onChanged: () => void;
}) {
  const now = useNow(60_000);
  const { timeZone, locale } = useUserClock();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
      setEditing(null);
      onChanged();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const when = formatListTime(u.createdAt, now, timeZone, locale);
  return (
    <View style={{ gap: 6, paddingVertical: 12, paddingHorizontal: 16 }} testID="org-update">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {[when, u.editedAt ? 'edited' : null, u.postedBy ? `by ${u.postedBy.displayName}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {canPost && editing === null ? (
          <>
            <IconButton
              icon={Pencil}
              label="Change this update"
              size={18}
              onPress={() => setEditing(u.body)}
            />
            <IconButton
              icon={Trash}
              label="Take this update back"
              size={18}
              onPress={() =>
                void run(() => endpoints.removeUpdate(u.org.id, u.id), 'Update taken back')
              }
              testID="org-update-remove"
            />
          </>
        ) : null}
      </View>
      {editing === null ? (
        <Body text={u.body} />
      ) : (
        <View style={{ gap: 8 }}>
          <TextField
            value={editing}
            onChangeText={setEditing}
            multiline
            maxLength={UPDATE_MAX}
            accessibilityLabel="The update"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Save"
              size="sm"
              loading={busy}
              disabled={!editing.trim()}
              onPress={() =>
                void run(() => endpoints.editUpdate(u.org.id, u.id, editing), 'Update changed')
              }
            />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditing(null)} />
          </View>
        </View>
      )}
    </View>
  );
}

export function OrgUpdates({ org }: { org: OrgView }) {
  const qc = useQueryClient();
  const q = useOrgUpdates(org.id);
  const first = q.data?.pages[0];
  const updates = q.data?.pages.flatMap((p) => p.updates) ?? [];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'post' | 'follow' | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.orgUpdates(org.id) });
    void qc.invalidateQueries({ queryKey: qk.following });
  };
  const following = first?.following ?? null;
  // Opened while following: what it posted isn't new any more.
  useEffect(() => {
    if (following)
      void endpoints
        .readUpdates(org.id)
        .then(() => qc.invalidateQueries({ queryKey: qk.following }))
        .catch(() => {});
  }, [following, org.id, qc]);
  if (!first) return null;
  const { canPost } = first;

  const follow = async (work: () => Promise<unknown>, done: string) => {
    setBusy('follow');
    try {
      await work();
      toast(done);
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const post = async () => {
    setBusy('post');
    try {
      await endpoints.postUpdate(org.id, draft);
      setDraft('');
      toast('Posted');
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const followRow = org.myRole ? null : first.blockedByMe ? null : following ? (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Button
        label="Following"
        size="sm"
        variant="secondary"
        loading={busy === 'follow'}
        onPress={() =>
          void follow(() => endpoints.unfollow(org.id), `You no longer follow ${org.name}`)
        }
        accessibilityHint="Stops following its updates"
        testID="org-unfollow"
      />
      <IconButton
        icon={following.notify ? Bell : BellOff}
        label={following.notify ? 'Stop notifying me of its updates' : 'Notify me of its updates'}
        onPress={() =>
          void follow(
            () => endpoints.follow(org.id, !following.notify),
            following.notify ? 'Its updates won’t notify you' : 'You’ll be notified of its updates',
          )
        }
        testID="org-notify"
      />
    </View>
  ) : (
    <Button
      label="Follow"
      size="sm"
      loading={busy === 'follow'}
      onPress={() =>
        void follow(
          () => endpoints.follow(org.id),
          `Following ${org.name}: its updates are in Updates`,
        )
      }
      testID="org-follow"
    />
  );

  return (
    <View style={{ paddingBottom: 12, gap: 8 }} testID="org-updates">
      <SectionTitle action={followRow}>Updates</SectionTitle>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {canPost ? (
          <Card>
            <View style={{ gap: 8 }}>
              <TextField
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={UPDATE_MAX}
                placeholder={`Share news with everyone who follows ${org.name}`}
                accessibilityLabel="A new update"
                testID="org-update-draft"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                  {first.followers === null
                    ? ''
                    : first.followers === 1
                      ? '1 person follows it. Nobody sees who.'
                      : `${first.followers} people follow it. Nobody sees who.`}
                </Text>
                <Button
                  label="Post"
                  size="sm"
                  loading={busy === 'post'}
                  disabled={!draft.trim()}
                  onPress={() => void post()}
                  testID="org-update-post"
                />
              </View>
            </View>
          </Card>
        ) : null}
        {updates.length ? (
          <Card padded={false}>
            {updates.map((u, i) => (
              <View key={u.id}>
                {i > 0 ? <Divider inset={16} /> : null}
                <Update u={u} canPost={canPost} onChanged={refresh} />
              </View>
            ))}
            {q.hasNextPage ? (
              <>
                <Divider />
                <Button
                  label="Older updates"
                  variant="ghost"
                  size="sm"
                  loading={q.isFetchingNextPage}
                  onPress={() => void q.fetchNextPage()}
                />
              </>
            ) : null}
          </Card>
        ) : (
          <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: 4 }}>
            {canPost
              ? 'Nothing posted yet. What you post here reaches everyone who follows it, as the organization.'
              : `${org.name} hasn’t posted any updates yet.`}
          </Text>
        )}
      </View>
    </View>
  );
}
