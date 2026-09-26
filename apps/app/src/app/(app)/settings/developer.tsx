import { PERSONAL_SCOPE_LABELS, PERSONAL_SCOPES, type PersonalScope } from '@caishy/core/access';
import type { PersonalTokenView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
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
  { value: '365', label: 'A year' },
  { value: 'never', label: 'No end' },
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
      title={made ? 'Your new token' : 'New access token'}
      footer={
        made ? (
          <Button label="Done" onPress={close} testID="token-done" />
        ) : (
          <Button
            label="Make the token"
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
          <CopyRow label="Access token" value={made} testID="token-value" />
          <Text variant="caption" color="textSecondary">
            Copy it now: you won’t see it again. Anyone who has it can act as you, within what you
            chose, so keep it where only you can reach it.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <TextField
            label="What will use it"
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="My reminders script"
            error={error}
            testID="token-name"
          />
          <Text variant="captionStrong" color="textSecondary">
            What it may do
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
            label="How long it lasts"
            value={lifetime}
            onChange={setLifetime}
            options={LIFETIMES.map((l) => ({ value: l.value, label: l.label }))}
          />
          <Text variant="caption" color="textTertiary">
            It can never change your password, privacy or sessions, make other tokens, or delete
            your account. Messages it sends say they came through it.
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
  const when = (iso: string) => formatListTime(iso, now, timeZone, locale);
  const revoke = async () => {
    setBusy(true);
    try {
      await endpoints.revokeToken(token.id);
      void qc.invalidateQueries({ queryKey: qk.tokens });
      toast(`${token.name} can’t be used any more`);
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
              token.lastUsedAt ? `used ${when(token.lastUsedAt)}` : 'never used',
              expired
                ? 'ended'
                : token.expiresAt
                  ? `ends ${when(token.expiresAt)}`
                  : 'until you revoke it',
            ].join(' · ')}
          </Text>
        </View>
        <Button
          label="Revoke"
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={() => void revoke()}
          testID={`token-revoke-${token.name}`}
        />
      </View>
      <Text variant="caption" color="textTertiary">
        {token.scopes.map((s) => PERSONAL_SCOPE_LABELS[s as PersonalScope] ?? s).join(' · ')}
      </Text>
    </View>
  );
}

/**
 * Developer (PRD §74): personal access tokens for your own scripts, each able to do only what
 * you chose, for as long as you chose, and never anything about your account itself.
 */
export default function DeveloperSettings() {
  const minor = useSession((s) => s.user?.minor ?? false);
  const q = useQuery({ queryKey: qk.tokens, queryFn: endpoints.tokens, enabled: !minor });
  const [making, setMaking] = useState(false);
  const tokens = q.data?.tokens ?? [];
  return (
    <SettingsPage title="Developer">
      {minor ? (
        <Card>
          <Text variant="body" color="textSecondary">
            Access tokens are for people over 18.
          </Text>
        </Card>
      ) : (
        <Group
          title="Personal access tokens"
          footer="A token acts as you in scripts and tools you run yourself, reaching your conversations and actions as you allowed. Caishy keeps only a fingerprint of each."
        >
          <Card padded={false}>
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
              title="New access token"
              subtitle={tokens.length ? undefined : 'For your own scripts and tools'}
              onPress={() => setMaking(true)}
              testID="token-new"
            />
          </Card>
        </Group>
      )}
      <NewToken open={making} onClose={() => setMaking(false)} />
    </SettingsPage>
  );
}
