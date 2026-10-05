/**
 * An organization's own checkout (R65): its owner connects the organization's own Stripe
 * account, and its Pay cards can then be paid by card, straight to it. Caime takes nothing and
 * never sees a card. Its managers see whether it's connected; only the owner connects or
 * disconnects. Shown only where this Caime can connect accounts.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { ownsOrg } from '@caime/core/orgs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { leaveFor } from '@/lib/links';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CreditCard } from '@/ui/icons';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function OrgCheckout({ org }: { org: OrgView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const owner = ownsOrg(org.myRole);
  const q = useQuery({
    queryKey: qk.orgCheckout(org.id),
    queryFn: () => endpoints.orgCheckout(org.id),
  });
  const [busy, setBusy] = useState(false);
  // Back from Stripe's page: say how it went, once.
  const { checkout: back } = useLocalSearchParams<{ checkout?: string }>();
  useEffect(() => {
    if (back !== 'connected' && back !== 'failed') return;
    toast(
      back === 'connected'
        ? tr('Connected. Cards paid on Pay cards go to {name}’s Stripe account.', {
            name: org.name,
          })
        : tr('Stripe didn’t connect. Try again, as the organization’s owner.'),
      back === 'connected' ? undefined : { tone: 'danger' },
    );
    void qc.invalidateQueries({ queryKey: qk.orgCheckout(org.id) });
    router.setParams({ checkout: undefined });
  }, [back, org.id, org.name, qc]);
  const view = q.data?.checkout;
  if (!view?.available) return null;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const connected = view.connected;
  return (
    <Card>
      <View style={{ gap: 10 }} testID="org-checkout">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} color={t.c.textSecondary} />
          <Text variant="label">{tr('Card payments')}</Text>
        </View>
        <Text variant="caption" color="textSecondary">
          {tr(
            'Connect {name}’s own Stripe account, and customers can pay its Pay cards by card. The money goes to that account; Caime takes nothing and never sees a card.',
            { name: org.name },
          )}
        </Text>
        {connected ? (
          <Spec
            testID="org-checkout-spec"
            rows={[
              { label: tr('account'), value: `Stripe ${connected.account}` },
              {
                label: tr('cards'),
                value: connected.chargesEnabled
                  ? tr('Accepted now')
                  : tr('Not yet: finish Stripe’s own setup'),
                testID: 'org-checkout-cards',
              },
              connected.live ? null : { label: tr('mode'), value: tr('Test') },
            ]}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {owner && !connected ? (
            <Button
              label={tr('Connect Stripe')}
              icon={CreditCard}
              loading={busy}
              onPress={() =>
                void run(async () => leaveFor((await endpoints.connectCheckout(org.id)).url))
              }
              testID="org-checkout-connect"
            />
          ) : null}
          {connected && !connected.chargesEnabled ? (
            <Button
              label={tr('Check again')}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(async () =>
                  qc.setQueryData(qk.orgCheckout(org.id), await endpoints.refreshCheckout(org.id)),
                )
              }
              testID="org-checkout-refresh"
            />
          ) : null}
          {owner && connected ? (
            <Button
              label={tr('Disconnect')}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await endpoints.disconnectCheckout(org.id);
                  await qc.invalidateQueries({ queryKey: qk.orgCheckout(org.id) });
                })
              }
              testID="org-checkout-disconnect"
            />
          ) : null}
        </View>
        {!owner ? (
          <Text variant="caption" color="textTertiary">
            {tr('Only its owner connects where its money goes.')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
