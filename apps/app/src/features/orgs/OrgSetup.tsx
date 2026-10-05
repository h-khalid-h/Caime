/**
 * Setting an organization up (R57), apart from its daily work: the door customers come in by,
 * proving who you are, your customers' data, hours and bookings, who answers first, apps and
 * the plan, in the order a clinic does it (R53). Its owner and admins only.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { canManageOrg } from '@caime/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useOrg } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { OrgAgent } from './OrgAgent';
import { OrgApps } from './OrgApps';
import { OrgBooking } from './OrgBooking';
import { OrgData } from './OrgData';
import { OrgDoor } from './OrgDoor';
import { OrgPlan } from './OrgPlan';
import { OrgVerification } from './OrgVerification';

export function OrgSetupScreen({ handle }: { handle: string }) {
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const q = useOrg(handle);
  const org = q.data?.org;
  const put = (o: OrgView) => {
    qc.setQueryData(qk.org(handle), { org: o });
    void qc.invalidateQueries({ queryKey: qk.orgs });
  };
  const back = (
    <IconButton
      icon={ArrowLeft}
      label={tr('Back')}
      onPress={() =>
        router.canGoBack()
          ? router.back()
          : router.replace({ pathname: '/o/[handle]', params: { handle } })
      }
    />
  );
  if (!org)
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar left={back} title={tr('Set up')} />
        {q.isError ? (
          <EmptyState
            title={tr('This organization isn’t here')}
            body={tr('It may have closed, or the handle is different.')}
          />
        ) : (
          <SkeletonRows />
        )}
      </Screen>
    );
  if (!canManageOrg(org.myRole))
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar left={back} title={tr('Set up {name}', { name: org.name })} />
        <EmptyState
          title={tr('Its owner and admins set {name} up', { name: org.name })}
          body={tr('Ask one of them to make you an admin, or to change what you need.')}
        />
      </Screen>
    );
  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar left={back} title={tr('Set up {name}', { name: org.name })} />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 32,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        }}
        testID="org-setup-screen"
      >
        <Text
          variant="caption"
          color="textSecondary"
          style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}
        >
          {tr(
            'In the order a clinic does it: the door customers come in by, proving who you are, their data, your hours, who answers first, then apps and the plan. Come back any time.',
          )}
        </Text>
        <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 12 }}>
          <OrgDoor org={org} />
          <OrgVerification org={org} refresh={put} />
          <OrgData org={org} refresh={put} />
        </View>
        <OrgBooking org={org} />
        <OrgAgent org={org} />
        <OrgApps org={org} />
        {org.plan ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <OrgPlan plan={org.plan} orgId={org.id} handle={org.handle} />
          </View>
        ) : null}
        {/* The daily work stays on its page: the inbox, updates, spaces, the team, insights. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <Card>
            <Text variant="caption" color="textSecondary">
              {tr('The team, its inbox, updates, spaces and insights are on {name}’s page.', {
                name: org.name,
              })}
            </Text>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
