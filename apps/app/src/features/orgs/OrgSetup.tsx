/**
 * Setting an organization up (R57), apart from its daily work: the door customers come in by,
 * proving who you are, your customers' data, hours and bookings, who answers first, apps and
 * the plan, in the order a clinic does it (R53). Its owner and admins only.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { canManageOrg, ownsOrg } from '@caime/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Circle from 'lucide-react-native/icons/circle';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, View } from 'react-native';
import { useOrg } from '@/api/hooks';
import { qk } from '@/api/keys';
import { putAnswer } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { Back } from '@/ui/directional';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { OrgAgent } from './OrgAgent';
import { OrgApps } from './OrgApps';
import { OrgBooking } from './OrgBooking';
import { OrgCheckout } from './OrgCheckout';
import { OrgCustomerFields } from './OrgCustomerFields';
import { OrgData } from './OrgData';
import { OrgDoor } from './OrgDoor';
import { OrgPlaces } from './OrgPlaces';
import { OrgPlan } from './OrgPlan';
import { OrgReplies } from './OrgReplies';
import { OrgVerification } from './OrgVerification';
import { type SetupStepKey, setupSteps } from './setupSteps';

// The team's invite panel (M16 C3a), loaded when "The rest of the team" is pressed.
const TeamInvites = lazyPart(() => import('./TeamInvites').then((m) => m.TeamInvites));

export function OrgSetupScreen({ handle }: { handle: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const q = useOrg(handle);
  const org = q.data?.org;
  // Where each step's section sits in the scroll, so the checklist's rows go there.
  const scroll = useRef<ScrollView>(null);
  const at = useRef<Partial<Record<SetupStepKey, number>>>({});
  const [inviting, setInviting] = useState(false);
  const mark = (key: SetupStepKey) => (e: LayoutChangeEvent) => {
    at.current[key] = e.nativeEvent.layout.y;
  };
  const go = (key: SetupStepKey) => {
    if (key === 'team') {
      setInviting(true);
      return;
    }
    const y = at.current[key];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };
  const put = (o: OrgView) => {
    putAnswer(qc, qk.org(handle), { org: o });
    void qc.invalidateQueries({ queryKey: qk.orgs });
  };
  const back = (
    <IconButton
      icon={Back}
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
        ref={scroll}
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
        {/* What's done and what's left (M16 C2b): hours and the team first, the domain when it
            can be, so a clinic without one is never stuck before it lets customers in. */}
        <SectionTitle>{tr('Getting set up')}</SectionTitle>
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            borderRadius: t.radii.lg,
            borderWidth: 1,
            borderColor: t.c.border,
            backgroundColor: t.c.surface,
            overflow: 'hidden',
          }}
          testID="setup-steps"
        >
          {setupSteps(org).map((s) => (
            <ListRow
              key={s.key}
              icon={s.done ? CircleCheck : Circle}
              iconColor={s.done ? t.c.success : t.c.textTertiary}
              title={s.label}
              subtitle={s.done ? tr('Done') : null}
              accessibilityLabel={
                s.done
                  ? tr('{step}: done', { step: s.label })
                  : tr('{step}: still to do', { step: s.label })
              }
              chevron
              onPress={() => go(s.key)}
              testID={`setup-step-${s.key}`}
            />
          ))}
        </View>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <OrgDoor org={org} />
        </View>
        <View onLayout={mark('verify')} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <OrgVerification org={org} refresh={put} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <OrgData org={org} refresh={put} />
        </View>
        <OrgPlaces org={org} />
        <View onLayout={mark('hours')}>
          <OrgBooking org={org} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <OrgCheckout org={org} />
        </View>
        <View onLayout={mark('agent')}>
          <OrgAgent org={org} />
        </View>
        <OrgReplies org={org} refresh={put} />
        <OrgCustomerFields
          org={org}
          refresh={() => void qc.invalidateQueries({ queryKey: qk.org(handle) })}
        />
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
      <Sheet
        open={inviting}
        onClose={() => setInviting(false)}
        title={tr('Invite your team')}
        subtitle={tr('They answer for the organization, over 18.')}
      >
        <TeamInvites orgId={org.id} orgName={org.name} owner={ownsOrg(org.myRole)} />
      </Sheet>
    </Screen>
  );
}
