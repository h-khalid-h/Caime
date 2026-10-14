/**
 * Your accounts (R90): a Google or Microsoft account connected once for the uses turned on,
 * phase 1 its calendar's busy times, so bookable times are never offered over a meeting kept
 * there. Each row says what it's used for, when it was last read and whether it needs
 * connecting again; reading it now and disconnecting are one tap each. The consent returns here
 * with a sealed claim this screen redeems (`connect.ts`), so only the person who asked can finish
 * a connection.
 */
import {
  ACCOUNT_PROVIDER_NAMES,
  ACCOUNT_USE_LABELS,
  type AccountProvider,
  type AccountReturn,
  type AccountReturnError,
} from '@caime/core/accounts';
import type { ConnectedAccountView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Group } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { AppIcon } from './AppIcon';
import { accountReturned, connectAccount, doneWithAccountReturn } from './connect';

const why = (error: AccountReturnError, name: string) =>
  error === 'denied'
    ? tr('{name} wasn’t connected: the permission wasn’t given.', { name })
    : error === 'expired'
      ? tr('That connection took too long. Connect again.')
      : error === 'adults'
        ? tr('Accounts are connected by people over 18.')
        : tr('{name} didn’t answer. Try again in a moment.', { name });

/** Says what a return came to: a claim redeemed, or why there's none. */
async function finish(r: AccountReturn, done: () => void) {
  const name = r.provider ? ACCOUNT_PROVIDER_NAMES[r.provider] : tr('The account');
  if ('cancelled' in r) return;
  if ('error' in r) {
    toast(why(r.error, name), { tone: 'danger' });
    return;
  }
  try {
    const { account } = await endpoints.claimAccount(r.provider, r.claim);
    done();
    toast(
      tr('{email} is connected. Its calendar is read in a moment.', {
        email: account.email ?? name,
      }),
    );
  } catch (e) {
    toast((e as Error).message, { tone: 'danger' });
  }
}

function AccountRow({ account }: { account: ConnectedAccountView }) {
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'remove' | 'again' | null>(null);
  const name = ACCOUNT_PROVIDER_NAMES[account.provider];
  const uses = account.uses.map((u) => tr(ACCOUNT_USE_LABELS[u].label)).join(' · ');
  const state =
    account.state === 'reconnect'
      ? tr('Needs connecting again')
      : account.state === 'failing'
        ? tr('{name} didn’t answer last time', { name })
        : account.syncedAt
          ? tr('read {when}', { when: formatWhen(account.syncedAt, now, timeZone, locale) })
          : tr('not read yet');
  const run = async (what: 'sync' | 'remove' | 'again') => {
    setAsking(false);
    setBusy(what);
    try {
      if (what === 'again') {
        const r = await connectAccount(account.provider, account.uses);
        if (r !== 'left')
          await finish(r, () => void qc.invalidateQueries({ queryKey: qk.accounts }));
      } else if (what === 'sync') {
        await endpoints.syncAccount(account.id);
        toast(tr('Reading it again'));
      } else {
        await endpoints.removeAccount(account.id);
        toast(tr('{email} is disconnected', { email: account.email ?? name }));
      }
      void qc.invalidateQueries({ queryKey: qk.accounts });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ padding: 16, gap: 12 }} testID={`account-${account.provider}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppIcon url={null} appId="account" name={name} mark={CalendarClock} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {account.email ?? name}
          </Text>
          <Text
            variant="caption"
            color={account.state === 'connected' ? 'textSecondary' : 'danger'}
            testID={`account-${account.provider}-state`}
          >
            {`${name} · ${uses} · ${state}`}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {account.state === 'reconnect' ? (
          <Button
            label={tr('Connect again')}
            size="sm"
            loading={busy === 'again'}
            onPress={() => void run('again')}
            testID={`account-${account.provider}-again`}
          />
        ) : (
          <Button
            label={tr('Read now')}
            size="sm"
            variant="secondary"
            loading={busy === 'sync'}
            onPress={() => void run('sync')}
            testID={`account-${account.provider}-sync`}
          />
        )}
        <Button
          label={tr('Disconnect')}
          size="sm"
          variant="secondary"
          loading={busy === 'remove'}
          onPress={() => setAsking(true)}
          testID={`account-${account.provider}-remove`}
        />
      </View>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={tr('Disconnect {email}?', { email: account.email ?? name })}
        subtitle={tr(
          'Caime deletes the busy times it read and stops reading. Your bookable times no longer leave room for that calendar.',
        )}
        footer={
          <Button
            label={tr('Disconnect')}
            variant="danger"
            block
            size="lg"
            onPress={() => void run('remove')}
            testID="account-remove-confirm"
          />
        }
      >
        <Text variant="body" color="textSecondary">
          {account.provider === 'microsoft'
            ? tr(
                'Microsoft keeps your permission until you remove Caime under your account’s apps and services.',
              )
            : tr('Google is told to forget the permission too.')}
        </Text>
      </Sheet>
    </View>
  );
}

export function Accounts() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.accounts, queryFn: endpoints.accounts });
  const [starting, setStarting] = useState<AccountProvider | null>(null);
  // The consent's return on the web, redeemed once (the screen may mount twice).
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const r = accountReturned();
    if (!r) return;
    handled.current = true;
    void finish(r, () => void qc.invalidateQueries({ queryKey: qk.accounts })).finally(
      doneWithAccountReturn,
    );
  }, [qc]);
  const accounts = q.data?.accounts ?? [];
  const offered = q.data?.offered ?? [];
  if (!q.data || (offered.length === 0 && accounts.length === 0)) return null;
  const connect = async (p: AccountProvider) => {
    setStarting(p);
    try {
      const r = await connectAccount(p, ['calendar']);
      if (r !== 'left') await finish(r, () => void qc.invalidateQueries({ queryKey: qk.accounts }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setStarting(null);
    }
  };
  return (
    <Group title={tr('Your accounts')} footer={tr(ACCOUNT_USE_LABELS.calendar.detail)}>
      {accounts.map((a, i) => (
        <View key={a.id}>
          {i > 0 ? <Divider /> : null}
          <AccountRow account={a} />
        </View>
      ))}
      {offered.length > 0 && accounts.length > 0 ? <Divider /> : null}
      {offered.length > 0 ? (
        <View style={{ padding: 16, gap: 8 }}>
          {accounts.length > 0 ? null : (
            <Text variant="body" color="textSecondary">
              {tr(
                'Connect the calendar you already keep, and nobody books you over a meeting there.',
              )}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {offered.map((p) => (
              <Button
                key={p}
                label={tr('Connect {name}', { name: ACCOUNT_PROVIDER_NAMES[p] })}
                size="sm"
                variant="secondary"
                loading={starting === p}
                onPress={() => void connect(p)}
                testID={`account-connect-${p}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Group>
  );
}
