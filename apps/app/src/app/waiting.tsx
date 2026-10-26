import type { FamilyResponse } from '@caime/core/api';
import { formatDayHeading } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { ParentPicker } from '@/features/family/ParentPicker';
import { API_URL, isWeb } from '@/lib/config';
import { useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/**
 * A child's account its parent hasn't agreed to yet (R122): whose yes it waits for, what that
 * parent will see, and nothing of the app until then. Begun without a parent's link (their own
 * sign-up, or an age corrected: R122 (2)), it's where they name their parent by handle, after
 * seeing who that is, or make a link to send a parent not on Caime yet; one who said no is asked
 * no more. Their data stays theirs: to download, or to delete. It goes on by itself when the
 * parent agrees (their `me.updated` refreshes the session), or when asked again.
 */
export default function Waiting() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const { timeZone, locale } = useUserClock();
  // Asked here as Family asks it (features/family/api.ts): a module both imported would sit in
  // the chunk every screen shares.
  const family = useQuery({
    queryKey: qk.family,
    queryFn: () => api.get<FamilyResponse>('/me/family'),
  });
  const wait = family.data?.wait ?? null;
  const asked = wait?.asked ?? family.data?.guardian?.person ?? null;
  const [checking, setChecking] = useState(false);
  const [naming, setNaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.family });
  // Who to ask is theirs to say while nobody is asked, or once they choose someone else.
  const choosing = wait !== null && wait.began !== 'link' && (!asked || naming);
  const deletes = wait ? formatDayHeading(wait.deletesAt, new Date(), timeZone, locale) : null;
  const deleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await endpoints.deleteAccount(password);
      await useSession.getState().signOut({ remote: false });
      toast(tr('Your account is deleted. Thank you for trying Caime.'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setDeleteBusy(false);
    }
  };
  return (
    <AuthLayout
      kicker={tr('Family')}
      title={
        asked && !naming
          ? tr('Waiting for {name}', { name: asked.displayName })
          : wait && wait.began !== 'link'
            ? tr('One more step: your parent or guardian')
            : tr('Waiting for your parent')
      }
      back={false}
      security
    >
      {choosing ? (
        <View style={{ gap: 16 }}>
          <Text color="textSecondary" testID="waiting-name-parent">
            {tr(
              'Where you live, a parent or guardian agrees to an account for someone your age. Ask yours: they agree from their own Caime, and you can write to each other.',
            )}
          </Text>
          {wait.refusals > 0 ? (
            <Text color="textSecondary" testID="waiting-refused">
              {trn(
                wait.asksLeft,
                'The person you asked said no. You can ask one more.',
                'The person you asked said no. You can ask {n} more.',
              )}
            </Text>
          ) : null}
          {wait.asksLeft > 0 ? (
            <ParentPicker
              childName={me?.displayName ?? ''}
              linkOpen={Boolean(wait.linkUntil)}
              onAsked={() => {
                setNaming(false);
                refresh();
              }}
            />
          ) : null}
          {naming ? (
            <Button
              label={tr('Keep waiting for them')}
              variant="ghost"
              onPress={() => setNaming(false)}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {asked ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              testID="waiting-asked"
            >
              <Avatar id={asked.id} name={asked.displayName} url={asked.avatarUrl} size={40} />
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {asked.displayName}
              </Text>
            </View>
          ) : null}
          <Text color="textSecondary" testID="waiting-for-parent">
            {tr(
              'Your parent or guardian agrees to your account from their own Caime. We told them. Once they do, Caime opens here.',
            )}
          </Text>
          {wait?.linkUntil && !asked ? (
            <Text color="textSecondary" testID="waiting-link-sent">
              {tr('You sent them a link. It’s open until {day}.', {
                day: formatDayHeading(wait.linkUntil, new Date(), timeZone, locale),
              })}
            </Text>
          ) : null}
          {wait && wait.began !== 'link' && wait.asksLeft > 0 ? (
            <Button
              label={tr('Ask someone else')}
              variant="ghost"
              onPress={() => setNaming(true)}
              testID="waiting-ask-other"
            />
          ) : null}
        </View>
      )}
      <Text color="textSecondary">
        {tr('They’ll see whom you’re connected with and who asks to connect. Never your messages.')}
      </Text>
      <Text color="textTertiary" variant="caption">
        {deletes
          ? tr('If nobody agrees by {day}, this account is deleted.', { day: deletes })
          : tr('If they don’t answer within a week, this account is deleted.')}
      </Text>
      <Button
        label={tr('Check again')}
        variant="secondary"
        loading={checking}
        onPress={() => {
          setChecking(true);
          refresh();
          void useSession
            .getState()
            .refresh()
            .finally(() => setChecking(false));
        }}
        testID="waiting-check"
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {isWeb ? (
          <Button
            label={tr('Download your data')}
            variant="ghost"
            size="sm"
            onPress={() => {
              window.location.href = `${API_URL}/v1/me/export`;
            }}
          />
        ) : null}
        <Button
          label={tr('Delete this account')}
          variant="ghost"
          size="sm"
          onPress={() => setDeleting(true)}
          testID="waiting-delete"
        />
        <Button
          label={tr('Sign out')}
          variant="ghost"
          size="sm"
          onPress={() => void useSession.getState().signOut()}
        />
      </View>
      <Sheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={tr('Delete this account')}
        subtitle={tr('Everything in it is deleted. This can’t be undone.')}
      >
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Your password')}
            secret
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label={tr('Delete my account')}
            variant="danger"
            disabled={!password}
            loading={deleteBusy}
            onPress={() => void deleteAccount()}
          />
        </View>
      </Sheet>
    </AuthLayout>
  );
}
