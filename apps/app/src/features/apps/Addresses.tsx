/**
 * What is you, beyond an app (R91): the sign-in email, the Caime address, and the email
 * addresses and phone numbers someone adds as theirs, each proven by a code sent to it (an email
 * by mail, a phone by WhatsApp) before it counts. Rows of the one "Your accounts" list, above the
 * connected accounts: each says what it is and whether it's proven, and how.
 */
import { ADDRESS_METHOD_LABELS, type AddressKind } from '@caime/core/addresses';
import type { OwnAddressView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AtSign from 'lucide-react-native/icons/at-sign';
import Mail from 'lucide-react-native/icons/mail';
import Smartphone from 'lucide-react-native/icons/smartphone';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { savePrefs } from '@/features/settings/savePrefs';
import { useMe } from '@/state/session';
import { usePrefs } from '@/theme/prefs';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { Sheet } from '@/ui/Sheet';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { AppIcon } from './AppIcon';

function Row({
  value,
  line,
  mark,
  pending,
  testID,
  children,
}: {
  value: string;
  line: string;
  mark: typeof Mail;
  pending?: boolean;
  testID: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ padding: 16, gap: 12 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppIcon url={null} appId="account" name={value} mark={mark} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {value}
          </Text>
          <Text
            variant="caption"
            color={pending ? 'warning' : 'textSecondary'}
            testID={`${testID}-state`}
          >
            {line}
          </Text>
        </View>
      </View>
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
      ) : null}
    </View>
  );
}

/** Adding one and proving it: the address, then the code sent to it. */
function AddSheet({
  kind,
  address,
  onClose,
}: {
  kind: AddressKind | null;
  /** One already added and waiting for its code, or null to add a new one. */
  address: OwnAddressView | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [sent, setSent] = useState<OwnAddressView | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = kind !== null || address !== null;
  // Each opening starts clean; closing keeps what was shown while the sheet fades.
  useEffect(() => {
    if (!open) return;
    setValue('');
    setSent(null);
    setCode('');
    setError(null);
  }, [open]);
  const last = useRef<AddressKind>('email');
  if (kind) last.current = kind;
  if (address) last.current = address.kind;
  const waiting = sent ?? address;
  const shownKind = waiting?.kind ?? kind ?? last.current;
  const send = async (raw: string) => {
    if (!shownKind) return;
    setBusy(true);
    setError(null);
    try {
      const r = await endpoints.addAddress({ kind: shownKind, value: raw });
      setSent(r.address);
      setCode('');
      void qc.invalidateQueries({ queryKey: qk.addresses });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const prove = async () => {
    if (!waiting) return;
    setBusy(true);
    setError(null);
    try {
      await endpoints.verifyAddress(waiting.id, code.trim());
      void qc.invalidateQueries({ queryKey: qk.addresses });
      toast(tr('{address} is yours on Caime.', { address: waiting.value }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const phone = shownKind === 'phone';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        waiting
          ? tr('Enter the code')
          : phone
            ? tr('Add a phone number')
            : tr('Add an email address')
      }
      subtitle={
        waiting
          ? phone
            ? tr('A code went to {address} on WhatsApp. It works for ten minutes.', {
                address: waiting.value,
              })
            : tr('A code went to {address}. It works for ten minutes.', {
                address: waiting.value,
              })
          : phone
            ? tr(
                'A code goes to it on WhatsApp. Proven, people who have the number can find you by it.',
              )
            : tr(
                'A code goes to it. Proven, mail from it is from you, and people who have it can find you by it.',
              )
      }
      footer={
        waiting ? (
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Prove it')}
              block
              size="lg"
              loading={busy}
              disabled={!/^\d{6}$/.test(code.trim())}
              onPress={() => void prove()}
              testID="address-prove"
            />
            <Button
              label={tr('Send a new code')}
              variant="secondary"
              block
              disabled={busy}
              onPress={() => void send(waiting.value)}
              testID="address-resend"
            />
          </View>
        ) : (
          <Button
            label={tr('Send the code')}
            block
            size="lg"
            loading={busy}
            disabled={value.trim().length < 3}
            onPress={() => void send(value)}
            testID="address-send"
          />
        )
      }
    >
      {waiting ? (
        <TextField
          label={tr('Code')}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          error={error}
          testID="address-code"
        />
      ) : (
        <TextField
          label={phone ? tr('Phone number') : tr('Email address')}
          value={value}
          onChangeText={setValue}
          keyboardType={phone ? 'phone-pad' : 'email-address'}
          autoCapitalize="none"
          autoComplete={phone ? 'tel' : 'email'}
          placeholder={phone ? '+20 101 234 5678' : undefined}
          hint={phone ? tr('With its country code.') : undefined}
          error={error}
          testID="address-value"
        />
      )}
    </Sheet>
  );
}

/** The person's own addresses as rows, and the buttons that add one. */
export function AddressRows() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.addresses, queryFn: endpoints.addresses });
  const [adding, setAdding] = useState<AddressKind | null>(null);
  const [proving, setProving] = useState<OwnAddressView | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (a: OwnAddressView) => {
    setRemoving(a.id);
    try {
      await endpoints.removeAddress(a.id);
      void qc.invalidateQueries({ queryKey: qk.addresses });
      toast(tr('{address} is removed', { address: a.value }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setRemoving(null);
    }
  };
  const addresses = q.data?.addresses ?? [];
  const phoneBy = q.data?.phoneBy ?? [];
  const mailOpens = usePrefs((s) => s.mailOpens);
  return (
    <>
      <Row
        value={me.email}
        line={
          me.emailVerified ? tr('Your sign-in · Verified') : tr('Your sign-in · Not confirmed yet')
        }
        mark={Mail}
        pending={!me.emailVerified}
        testID="address-sign-in"
      />
      {me.mailAddress ? (
        <>
          <Divider />
          <Row
            value={me.mailAddress}
            line={tr('Your Caime address · Mail to it lands in Caime')}
            mark={AtSign}
            testID="address-caime"
          />
          {/* Whether mail sent from it says when it's opened (R75): the mail says so too. */}
          <SwitchRow
            label={tr('Tell me when my mail is opened')}
            detail={tr(
              'Mail from here says so at its end. Opened is a probably: some mail apps open everything.',
            )}
            value={mailOpens}
            onChange={(v) => savePrefs({ mailOpens: v })}
            inset
            testID="mail-opens"
          />
        </>
      ) : null}
      {addresses.map((a) => (
        <View key={a.id}>
          <Divider />
          <Row
            value={a.value}
            line={
              a.verified && a.method
                ? `${tr('Verified')} · ${tr(ADDRESS_METHOD_LABELS[a.method])}`
                : tr('Not proven yet')
            }
            mark={a.kind === 'phone' ? Smartphone : Mail}
            pending={!a.verified}
            testID={`address-${a.value}`}
          >
            {a.verified ? null : (
              <Button
                label={tr('Enter the code')}
                size="sm"
                onPress={() => setProving(a)}
                testID={`address-${a.value}-code`}
              />
            )}
            <Button
              label={tr('Remove')}
              size="sm"
              variant="secondary"
              loading={removing === a.id}
              onPress={() => void remove(a)}
              testID={`address-${a.value}-remove`}
            />
          </Row>
        </View>
      ))}
      <Divider />
      <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label={tr('Add an email address')}
          size="sm"
          variant="secondary"
          onPress={() => setAdding('email')}
          testID="address-add-email"
        />
        {phoneBy.length > 0 ? (
          <Button
            label={tr('Add a phone number')}
            size="sm"
            variant="secondary"
            onPress={() => setAdding('phone')}
            testID="address-add-phone"
          />
        ) : null}
      </View>
      <AddSheet
        kind={adding}
        address={proving}
        onClose={() => {
          setAdding(null);
          setProving(null);
        }}
      />
    </>
  );
}
