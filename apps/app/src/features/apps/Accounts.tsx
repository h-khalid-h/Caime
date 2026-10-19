/**
 * Your accounts (R90): a Google or Microsoft account connected once for the uses turned on: its
 * calendars' busy times, so bookable times are never offered over a meeting kept there, and
 * (R96) Plans, Caime's meetings and appointments written into that calendar. Each row says what
 * it's used for, when its calendar was last read and its plans last written, why a use's last try
 * failed if it did (M16 G2: each use apart), and whether it needs connecting again (or again to
 * read every calendar, not only the main one); reading it now and disconnecting are one tap each. The consent returns here
 * with a sealed claim this screen redeems (`connect.ts`), so only the person who asked can finish
 * a connection.
 */
import {
  ACCOUNT_PROVIDER_NAMES,
  ACCOUNT_USE_LABELS,
  ACCOUNT_USES,
  type AccountFailure,
  type AccountProvider,
  type AccountReturn,
  type AccountReturnError,
  type AccountRunningUse,
  type AccountUse,
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
import { AddressRows } from './Addresses';
import { AppIcon } from './AppIcon';
import { accountReturned, connectAccount, doneWithAccountReturn } from './connect';

const why = (error: AccountReturnError, name: string) =>
  error === 'denied'
    ? tr('{name} wasn’t connected: the permission wasn’t given.', { name })
    : error === 'expired'
      ? tr('That connection took too long. Connect again.')
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
    const email = account.email ?? name;
    toast(
      account.uses.includes('calendar')
        ? tr('{email} is connected. Its calendar is read in a moment.', { email })
        : tr('{email} is connected.', { email }),
    );
  } catch (e) {
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Why a use's last try failed, in the reader's words (M16 G2). */
function failureLine(use: AccountRunningUse, failure: AccountFailure, name: string): string {
  if (use === 'calendar')
    return failure === 'limited'
      ? tr('{name} asked Caime to wait before reading again', { name })
      : failure === 'refused'
        ? tr('{name} refused the last read', { name })
        : tr('{name} didn’t answer the last read', { name });
  return failure === 'limited'
    ? tr('{name} asked Caime to wait before writing again', { name })
    : failure === 'refused'
      ? tr('{name} refused the last change Caime sent', { name })
      : tr('{name} didn’t answer the last change Caime sent', { name });
}

function AccountRow({
  account,
  offered,
}: {
  account: ConnectedAccountView;
  /** The uses this provider offers here, so one not yet on can be added. */
  offered: AccountUse[];
}) {
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'remove' | 'again' | AccountUse | null>(null);
  const name = ACCOUNT_PROVIDER_NAMES[account.provider];
  const uses = account.uses.map((u) => tr(ACCOUNT_USE_LABELS[u].label)).join(' · ');
  const when = (at: string) => formatWhen(at, now, timeZone, locale);
  // Each use that runs on its own says how it last went (M16 G2); a copy kept from before has none.
  const health = account.health ?? [];
  const plans = health.find((h) => h.use === 'plans');
  const facts =
    account.state === 'reconnect'
      ? [tr('Needs connecting again')]
      : [
          ...(account.uses.includes('calendar')
            ? [
                account.syncedAt
                  ? tr('read {when}', { when: when(account.syncedAt) })
                  : tr('not read yet'),
              ]
            : []),
          ...(plans?.workedAt ? [tr('written {when}', { when: when(plans.workedAt) })] : []),
        ];
  const failures =
    account.state === 'reconnect'
      ? []
      : health.flatMap((h) =>
          h.failure && h.failedAt
            ? [`${failureLine(h.use, h.failure, name)} · ${when(h.failedAt)}`]
            : [],
        );
  // What the release before said, until a read or a push works.
  if (account.state === 'failing' && failures.length === 0)
    failures.push(tr('{name} didn’t answer last time', { name }));
  const missing = offered.filter((u) => !account.uses.includes(u));
  // Read from the main calendar alone (R96): connecting again asks for the list of them all.
  const every = account.state !== 'reconnect' && account.mainCalendarOnly;
  const run = async (what: 'sync' | 'remove' | 'again' | AccountUse) => {
    setAsking(false);
    setBusy(what);
    try {
      if (what === 'again' || (ACCOUNT_USES as readonly string[]).includes(what)) {
        // Connecting again, or adding a use: the provider asks for what's new and keeps the rest.
        const uses = what === 'again' ? account.uses : [...account.uses, what as AccountUse];
        const r = await connectAccount(account.provider, uses);
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
            color={account.state === 'reconnect' ? 'danger' : 'textSecondary'}
            testID={`account-${account.provider}-state`}
          >
            {[name, uses, ...facts, ...(every ? [tr('main calendar only')] : [])].join(' · ')}
          </Text>
          {failures.map((line) => (
            <Text
              key={line}
              variant="caption"
              color="danger"
              testID={`account-${account.provider}-failure`}
            >
              {line}
            </Text>
          ))}
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
        {every ? (
          <Button
            label={tr('Read every calendar')}
            size="sm"
            variant="secondary"
            loading={busy === 'again'}
            onPress={() => void run('again')}
            testID={`account-${account.provider}-every`}
          />
        ) : null}
        {account.state === 'reconnect'
          ? null
          : missing.map((u) => (
              <Button
                key={u}
                label={tr('Add {use}', { use: tr(ACCOUNT_USE_LABELS[u].label) })}
                size="sm"
                variant="secondary"
                loading={busy === u}
                onPress={() => void run(u)}
                testID={`account-${account.provider}-add-${u}`}
              />
            ))}
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
        {account.uses.includes('plans') ? (
          <Text variant="body" color="textSecondary">
            {tr('The plans Caime added to its calendar that are still ahead are taken out.')}
          </Text>
        ) : null}
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

/**
 * The one list of what is you (R91): your addresses first, proven or not, then the accounts
 * connected for their uses. Under 18, only the addresses: accounts are connected by adults.
 */
export function Accounts({ minor }: { minor: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.accounts, queryFn: endpoints.accounts, enabled: !minor });
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
  const connect = async (p: AccountProvider) => {
    setStarting(p);
    try {
      // Its calendar both ways (R96): busy times read, plans written; either can be unticked.
      const r = await connectAccount(p, ['calendar', 'plans']);
      if (r !== 'left') await finish(r, () => void qc.invalidateQueries({ queryKey: qk.accounts }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setStarting(null);
    }
  };
  return (
    <Group
      title={tr('Your accounts')}
      // What each use offered here does, one line each ("Calendar: …").
      footer={ACCOUNT_USES.filter((u) => offered.some((p) => q.data?.usesOffered[p].includes(u)))
        .map((u) => `${tr(ACCOUNT_USE_LABELS[u].label)}: ${tr(ACCOUNT_USE_LABELS[u].detail)}`)
        .join('\n')}
    >
      <AddressRows />
      {accounts.map((a) => (
        <View key={a.id}>
          <Divider />
          <AccountRow account={a} offered={q.data?.usesOffered[a.provider] ?? []} />
        </View>
      ))}
      {offered.length > 0 ? <Divider /> : null}
      {offered.length > 0 ? (
        <View style={{ padding: 16, gap: 8 }}>
          {accounts.length > 0 ? null : (
            <Text variant="body" color="textSecondary">
              {tr(
                'Connect the calendar you already keep: nobody books you over a meeting there, and your plans in Caime show in it.',
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
