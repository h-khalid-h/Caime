import { PERSONAL_SCOPE_LABELS, PERSONAL_SCOPES, type PersonalScope } from '@caime/core/access';
import type { PersonalTokenView } from '@caime/core/api';
import { formatListTime, formatWhen } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { OAuthApps } from '@/features/settings/OAuthApps';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { KeyRound, Plus } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const LIFETIMES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: msg('A year') },
  { value: 'never', label: msg('No end') },
] as const;
type Lifetime = (typeof LIFETIMES)[number]['value'];

const toggled = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

/** Making one: what it's for, what it may do, for how long; then the token, this once. */
function NewToken({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<PersonalScope[]>(['messages:read']);
  const [lifetime, setLifetime] = useState<Lifetime>('90');
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setName('');
    setScopes(['messages:read']);
    setLifetime('90');
    setMade(null);
    setError(null);
    onClose();
  };
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await endpoints.createToken({
        name: name.trim(),
        scopes,
        days: lifetime === 'never' ? null : (Number(lifetime) as 30 | 90 | 365),
      });
      setMade(token);
      void qc.invalidateQueries({ queryKey: qk.tokens });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={made ? tr('Your new token') : tr('New access token')}
      footer={
        made ? (
          <Button label={tr('Done')} onPress={close} testID="token-done" />
        ) : (
          <Button
            label={tr('Make the token')}
            onPress={() => void create()}
            loading={busy}
            disabled={!name.trim() || scopes.length === 0}
            testID="token-create"
          />
        )
      }
    >
      {made ? (
        <View style={{ gap: 12 }}>
          <CopyRow label={tr('Access token')} value={made} testID="token-value" />
          <Text variant="caption" color="textSecondary">
            {tr(
              'Copy it now: you won’t see it again. Anyone who has it can act as you, within what you chose, so keep it where only you can reach it.',
            )}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('What will use it')}
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={tr('My reminders script')}
            error={error}
            testID="token-name"
          />
          <Text variant="captionStrong" color="textSecondary">
            {tr('What it may do')}
          </Text>
          <View style={{ marginHorizontal: -20 }}>
            {PERSONAL_SCOPES.map((s) => (
              <ListRow
                key={s}
                title={PERSONAL_SCOPE_LABELS[s]}
                checked={scopes.includes(s)}
                onPress={() => setScopes((x) => toggled(x, s))}
                testID={`token-scope-${s}`}
              />
            ))}
          </View>
          <Segmented
            label={tr('How long it lasts')}
            value={lifetime}
            onChange={setLifetime}
            options={LIFETIMES.map((l) => ({ value: l.value, label: tr(l.label) }))}
          />
          <Text variant="caption" color="textTertiary">
            {tr(
              'It can never change your password, privacy or sessions, make other tokens, or delete your account. Messages it sends say they came through it.',
            )}
          </Text>
        </View>
      )}
    </Sheet>
  );
}

function TokenRow({ token }: { token: PersonalTokenView }) {
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const when = (iso: string) => formatListTime(iso, now, timeZone, locale);
  const revoke = async () => {
    setAsking(false);
    setBusy(true);
    try {
      await endpoints.revokeToken(token.id);
      void qc.invalidateQueries({ queryKey: qk.tokens });
      toast(tr('{name} can’t be used any more', { name: token.name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const expired = token.expiresAt !== null && Date.parse(token.expiresAt) <= now.getTime();
  return (
    <View style={{ padding: 16, gap: 8 }} testID={`token-${token.name}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {token.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {[
              `${token.prefix}…`,
              token.lastUsedAt
                ? `used ${formatWhen(token.lastUsedAt, now, timeZone, locale)}`
                : 'never used',
              expired
                ? 'ended'
                : token.expiresAt
                  ? `ends ${when(token.expiresAt)}`
                  : 'until you revoke it',
            ].join(' · ')}
          </Text>
        </View>
        <Button
          label={tr('Revoke')}
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={() => setAsking(true)}
          testID={`token-revoke-${token.name}`}
        />
      </View>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={tr('Revoke {name}?', { name: token.name })}
        subtitle={tr(
          'Anything using it stops at once, and it can’t be brought back: make a new one instead.',
        )}
        footer={
          <Button
            label={tr('Revoke')}
            variant="danger"
            block
            size="lg"
            onPress={() => void revoke()}
            testID="token-revoke-confirm"
          />
        }
      >
        <Text variant="body" color="textSecondary">
          {tr('What was sent through it stays, marked as sent that way.')}
        </Text>
      </Sheet>
      <Text variant="caption" color="textTertiary">
        {token.scopes.map((s) => PERSONAL_SCOPE_LABELS[s as PersonalScope] ?? s).join(' · ')}
      </Text>
    </View>
  );
}

/**
 * Developer (PRD §74): personal access tokens for your own scripts, each able to do only what
 * you chose, for as long as you chose, and never anything about your account itself; and apps
 * you make for other people, which they let in through OAuth.
 */
export default function DeveloperSettings() {
  const minor = useSession((s) => s.user?.minor ?? false);
  const q = useQuery({ queryKey: qk.tokens, queryFn: endpoints.tokens, enabled: !minor });
  const [making, setMaking] = useState(false);
  const tokens = q.data?.tokens ?? [];
  return (
    <SettingsPage title={tr('Developer')}>
      {minor ? (
        <Card>
          <Text variant="body" color="textSecondary">
            {tr('Access tokens and apps are for people over 18.')}
          </Text>
        </Card>
      ) : (
        <>
          <Group
            title={tr('Personal access tokens')}
            footer={tr(
              'A token acts as you in scripts and tools you run yourself, reaching your conversations and actions as you allowed. Caime keeps only a fingerprint of each.',
            )}
          >
            {q.isPending ? (
              <SkeletonRows />
            ) : (
              tokens.map((k, i) => (
                <View key={k.id}>
                  {i > 0 ? <Divider /> : null}
                  <TokenRow token={k} />
                </View>
              ))
            )}
            {tokens.length ? <Divider /> : null}
            <ListRow
              icon={tokens.length ? Plus : KeyRound}
              title={tr('New access token')}
              subtitle={tokens.length ? undefined : tr('For your own scripts and tools')}
              onPress={() => setMaking(true)}
              testID="token-new"
            />
          </Group>
          <OAuthApps />
        </>
      )}
      <NewToken open={making} onClose={() => setMaking(false)} />
    </SettingsPage>
  );
}
