import type { OrgMemberView, OrgView } from '@caime/core/api';
import { describeHours } from '@caime/core/booking';
import { tr, trn } from '@caime/core/i18n';
import {
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  ORG_ROLE_LABELS,
  orgKindName,
  ownsOrg,
} from '@caime/core/orgs';
import { handsOverOnLeaving, minorMayWriteToOrg } from '@caime/core/permissions';
import { PLAN_NAMES } from '@caime/core/plans';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useBusinessSummary, useOrg, useOrgSpaces } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useCountries } from '@/features/geo/countries';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { report } from '@/features/safety/report';
import { OrgUpdates } from '@/features/updates/OrgUpdates';
import { handleLink } from '@/lib/config';
import { openLink } from '@/lib/links';
import { shareLink } from '@/lib/share';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import {
  ArchiveIcon,
  ArrowLeft,
  Ban,
  CalendarCheck,
  Flag,
  Globe,
  Inbox,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Pencil,
  Settings,
  Share,
  ShoppingBag,
  UserPlus,
  Wrench,
} from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { OrgMark, VerifiedLine } from './kinds';
import { OrgDetailsSheet } from './OrgDetails';
import { OrgInsights } from './OrgInsights';
import { nextOrgPlanLine } from './planLine';
import { setupNextLine } from './setupSteps';

/** An organization (PRD §36): who it is, whether that's verified, and its team. */
export function OrgScreen({
  handle,
  write = false,
  book = null,
}: {
  handle: string;
  write?: boolean;
  /** Arrived through a Book or an Order link (R58, R60): that card's form. */
  book?: 'appointment' | 'order_status' | null;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const me = useSession((s) => s.user?.id ?? '');
  const q = useOrg(handle);
  const org = q.data?.org;
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState<OrgMemberView | null>(null);
  const lastManaged = useRef<OrgMemberView | null>(null);
  if (managing) lastManaged.current = managing;
  const shown = managing ?? lastManaged.current;
  const [leaving, setLeaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const locale = useSession((s) => s.user?.locale) ?? 'en';
  const countries = useCountries(locale).data?.countries;
  const minor = useSession((s) => s.user?.minor ?? false);
  const teams = useBusinessSummary(Boolean(org?.myRole)).data?.orgs;
  const orgSpaces = useOrgSpaces(org?.myRole ? (org?.id ?? null) : null).data?.spaces;
  const waiting = teams?.find((x) => x.org.id === org?.id);

  /** A customer's one conversation with it: theirs if it exists, else a new one (PRD §38). */
  const message = async (orgId: string, kit: 'appointment' | 'order_status' | null = null) => {
    setStarting(true);
    try {
      const { conversationId } = await endpoints.messageOrg(orgId);
      void qc.invalidateQueries({ queryKey: qk.inbox });
      // Book (R58): the conversation opens on the appointment card's form.
      router.push({
        pathname: '/c/[id]',
        params:
          kit === 'appointment'
            ? { id: conversationId, book: '1' }
            : kit === 'order_status'
              ? { id: conversationId, order: '1' }
              : { id: conversationId },
      });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setStarting(false);
    }
  };
  // Through the door (R53, `?write`): a customer lands in the conversation with nothing more
  // to tap. Once per screen; the team, someone who blocked it and a minor it can't take stay.
  const walkedIn = useRef(false);
  const canWrite = Boolean(
    org && !org.myRole && !org.blockedByMe && minorMayWriteToOrg(minor, org.verified),
  );
  useEffect(() => {
    if ((!write && !book) || !org || walkedIn.current || !canWrite) return;
    walkedIn.current = true;
    void (async () => {
      setStarting(true);
      try {
        const { conversationId } = await endpoints.messageOrg(org.id);
        void qc.invalidateQueries({ queryKey: qk.inbox });
        router.replace({
          pathname: '/c/[id]',
          params:
            book === 'appointment' && org.booking
              ? { id: conversationId, book: '1' }
              : book === 'order_status' && org.ordering
                ? { id: conversationId, order: '1' }
                : { id: conversationId },
        });
      } catch (e) {
        toast((e as Error).message, { tone: 'danger' });
      } finally {
        setStarting(false);
      }
    })();
  }, [write, book, org, canWrite, qc]);

  const put = (o: OrgView) => {
    qc.setQueryData(qk.org(handle), { org: o });
    void qc.invalidateQueries({ queryKey: qk.orgs });
  };
  const reload = () => {
    void qc.invalidateQueries({ queryKey: qk.org(handle) });
    void qc.invalidateQueries({ queryKey: qk.orgs });
    // Following it, and its updates, change with blocking it.
    void qc.invalidateQueries({ queryKey: qk.allUpdates });
  };
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast(done);
      reload();
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <IconButton
      icon={ArrowLeft}
      label={tr('Back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/orgs'))}
    />
  );
  if (!org)
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar left={desktop ? undefined : back} title={tr('Organization')} />
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

  const manager = canManageOrg(org.myRole);
  const onTeam = new Set((org.members ?? []).map((m) => m.userId));
  // Room on the team under its plan; only its owner and admins see the plan, and add people.
  const room = org.plan ? Math.max(0, org.plan.allowance.teamSize - org.plan.used.teamSize) : null;

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={desktop ? undefined : back}
        title={org.name}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {manager ? (
              <IconButton
                icon={Pencil}
                label={tr('Edit details')}
                onPress={() => setEditing(true)}
                testID="org-edit"
              />
            ) : null}
            <IconButton
              icon={Share}
              label={tr('Share {name}’s link', { name: org.name })}
              onPress={() =>
                void shareLink(tr('{name} on Caime:', { name: org.name }), handleLink(org.handle))
              }
              testID="org-share"
            />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 32,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <OrgMark kind={org.kind} url={org.avatarUrl} size={72} testID="org-mark" />
          <Text variant="title" align="center" auto>
            {org.name}
          </Text>
          {org.about ? (
            <Text variant="body" color="textSecondary" align="center" auto>
              {org.about}
            </Text>
          ) : null}
          <Spec
            style={{ alignSelf: 'stretch', marginTop: 8 }}
            testID="org-spec"
            rows={[
              { label: tr('handle'), value: `@${org.handle}` },
              { label: tr('kind'), value: orgKindName(org.kind) },
              { label: tr('verified'), value: <VerifiedLine org={org} /> },
              org.country
                ? {
                    label: tr('based in'),
                    value: countries?.find((c) => c.code === org.country)?.name ?? org.country,
                  }
                : null,
              org.foundedYear
                ? { label: tr('since'), value: String(org.foundedYear), testID: 'org-place' }
                : null,
              org.booking
                ? { label: tr('bookings'), value: describeHours(org.booking), testID: 'org-hours' }
                : null,
              org.website
                ? {
                    label: tr('website'),
                    value: (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => openLink(org.website ?? '')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        testID="org-website"
                      >
                        <Globe size={14} color={t.c.link} />
                        <Text variant="bodyStrong" color="link">
                          {org.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </Text>
                      </Pressable>
                    ),
                  }
                : null,
            ]}
          />
          {org.myRole ? null : org.blockedByMe ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 6 }} testID="org-blocked">
              <Text variant="caption" color="textSecondary" align="center">
                {tr(
                  'You blocked {name}. It can’t write to you, and your conversation with it is closed.',
                  { name: org.name },
                )}
              </Text>
              <Button
                label={tr('Unblock {name}', { name: org.name })}
                variant="secondary"
                size="sm"
                loading={busy}
                onPress={() =>
                  void run(() => endpoints.unblockOrg(org.id), `${org.name} is unblocked`)
                }
                testID="org-unblock"
              />
            </View>
          ) : minor && !org.verified ? (
            <Text
              variant="caption"
              color="textTertiary"
              align="center"
              testID="org-minor-unverified"
            >
              {tr('Under 18, you can message organizations that have verified who they are.')}
            </Text>
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
              >
                <Button
                  label={tr('Message {name}', { name: org.name })}
                  icon={MessageCircle}
                  loading={starting}
                  style={{ marginTop: 6 }}
                  onPress={() => void message(org.id)}
                  testID="org-message"
                />
                {org.booking ? (
                  <Button
                    label={tr('Book')}
                    icon={CalendarCheck}
                    variant="secondary"
                    disabled={starting}
                    style={{ marginTop: 6 }}
                    onPress={() => void message(org.id, 'appointment')}
                    testID="org-book"
                  />
                ) : null}
                {org.ordering ? (
                  <Button
                    label={tr('Order')}
                    icon={ShoppingBag}
                    variant="secondary"
                    disabled={starting}
                    style={{ marginTop: 6 }}
                    onPress={() => void message(org.id, 'order_status')}
                    testID="org-order"
                  />
                ) : null}
              </View>
              {minor ? (
                <Text variant="caption" color="textTertiary" align="center">
                  {tr('Its team will see you’re under 18.')}
                </Text>
              ) : org.agent ? (
                // Before anyone writes, they know an AI answers first (PRD §75).
                <Text variant="caption" color="textTertiary" align="center" testID="org-agent-line">
                  {tr(
                    '{name}, its AI agent, answers first and says so. Ask for a person any time.',
                    { name: org.agent.name },
                  )}
                </Text>
              ) : null}
              {/* What "Verified" means, in one line, before they write (R53). */}
              <Text
                variant="caption"
                color="textTertiary"
                align="center"
                testID="org-verified-line"
              >
                {org.verified
                  ? tr('Verified: {name} proved it controls {verifiedDomain}.', {
                      name: org.name,
                      verifiedDomain: org.verifiedDomain,
                    })
                  : tr(
                      'Caime hasn’t verified who runs this organization. Be careful with links and payments.',
                    )}
              </Text>
            </View>
          )}
        </View>

        {org.myRole ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Card padded={false}>
              <ListRow
                icon={Inbox}
                title={tr('Inbox')}
                subtitle={
                  waiting?.waiting
                    ? trn(waiting.waiting, '{n} customer waiting', '{n} customers waiting') +
                      (waiting.mine ? ` · ${tr('{n} yours', { n: waiting.mine })}` : '')
                    : tr('Customers’ conversations with the team')
                }
                onPress={() =>
                  router.push({ pathname: '/o/[handle]/inbox', params: { handle: org.handle } })
                }
                testID="org-inbox"
              />
              {manager ? (
                // Setting it up (R57) is its own screen: the door, the domain, data, hours, the
                // AI agent, apps and the plan, in a clinic's order. The row says what's next.
                <ListRow
                  icon={Wrench}
                  title={tr('Set up {name}', { name: org.name })}
                  subtitle={setupNextLine(org)}
                  onPress={() =>
                    router.push({ pathname: '/o/[handle]/setup', params: { handle: org.handle } })
                  }
                  testID="org-setup"
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        <OrgUpdates org={org} />

        {org.myRole ? (
          <>
            <SectionTitle
              action={
                manager ? (
                  <Button
                    label={tr('New space')}
                    icon={LayoutGrid}
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      router.push({ pathname: '/new-space', params: { org: org.handle } })
                    }
                    testID="org-spaces-new"
                  />
                ) : undefined
              }
            >
              {tr('Spaces')}
            </SectionTitle>
            <View style={{ marginHorizontal: 16 }} testID="org-spaces">
              {orgSpaces?.length ? (
                <Card padded={false}>
                  {orgSpaces.map((s) => (
                    <ListRow
                      key={s.id}
                      icon={LayoutGrid}
                      title={s.name}
                      subtitle={`${trn(s.memberCount, '{n} person', '{n} people')}${
                        s.joined ? '' : ` · ${tr('You’re not in it')}`
                      }`}
                      right={
                        s.joined ? undefined : (
                          <Button
                            label={tr('Join')}
                            size="sm"
                            variant="secondary"
                            loading={busy}
                            onPress={() =>
                              void (async () => {
                                if (await run(() => endpoints.joinOrgSpace(org.id, s.id))) {
                                  void qc.invalidateQueries({ queryKey: qk.orgSpaces(org.id) });
                                  void qc.invalidateQueries({ queryKey: qk.spaces });
                                  router.navigate({ pathname: '/s/[id]', params: { id: s.id } });
                                }
                              })()
                            }
                            testID={`org-space-join-${s.name}`}
                          />
                        )
                      }
                      onPress={
                        s.joined
                          ? () => router.navigate({ pathname: '/s/[id]', params: { id: s.id } })
                          : undefined
                      }
                      testID={`org-space-${s.name}`}
                    />
                  ))}
                </Card>
              ) : (
                <Text variant="caption" color="textSecondary">
                  {manager
                    ? tr(
                        'A space keeps the team together: its people, and conversations everyone can find. Start one for the team, a project or a branch.',
                      )
                    : tr('None yet that you’re in.')}
                </Text>
              )}
            </View>
          </>
        ) : null}

        {org.members ? (
          <>
            <SectionTitle
              action={
                manager ? (
                  <Button
                    label={tr('Add')}
                    icon={UserPlus}
                    size="sm"
                    variant="ghost"
                    onPress={() => setAdding(true)}
                    testID="org-add-people"
                  />
                ) : undefined
              }
            >
              {tr('Team · {memberCount}', { memberCount: org.memberCount })}
            </SectionTitle>
            <View
              style={{
                marginHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: t.c.border,
                backgroundColor: t.c.surface,
                overflow: 'hidden',
              }}
            >
              {org.members.map((m) => {
                const self = m.userId === me;
                // An app's bot says so (R16), and is managed with its app, not here.
                const bot = m.person.kind !== 'human';
                const manageable =
                  !self &&
                  !bot &&
                  org.myRole !== null &&
                  (canRemoveFromOrg(org.myRole, m.role) || canChangeOrgRole(org.myRole, m.role));
                return (
                  <ListRow
                    key={m.userId}
                    left={
                      <Avatar
                        id={m.userId}
                        name={m.person.displayName}
                        url={m.person.avatarUrl}
                        size={36}
                      />
                    }
                    title={
                      self
                        ? tr('{displayName} (you)', { displayName: m.person.displayName })
                        : m.person.displayName
                    }
                    subtitle={
                      m.person.kind === 'agent'
                        ? tr('AI agent · says so in everything it writes')
                        : bot
                          ? tr('Bot · an app’s, labelled automated')
                          : [m.title, ORG_ROLE_LABELS[m.role]].filter(Boolean).join(' · ')
                    }
                    onPress={
                      manageable
                        ? () => setManaging(m)
                        : self || bot
                          ? undefined
                          : () => router.navigate({ pathname: '/p/[id]', params: { id: m.userId } })
                    }
                  />
                );
              })}
            </View>
            {manager && org.plan?.allowance.insights ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <OrgInsights orgId={org.id} />
              </View>
            ) : null}
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
              <Card padded={false}>
                <ListRow
                  icon={LogOut}
                  title={tr('Leave {name}', { name: org.name })}
                  destructive
                  onPress={() => setLeaving(true)}
                  testID="org-leave"
                />
                {ownsOrg(org.myRole) ? (
                  <ListRow
                    icon={ArchiveIcon}
                    title={tr('Close {name}', { name: org.name })}
                    subtitle={tr('Its page goes, and the team’s seats end.')}
                    destructive
                    onPress={() => setClosing(true)}
                    testID="org-close"
                  />
                ) : null}
              </Card>
            </View>
          </>
        ) : null}
        {!org.members ? (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Card padded={false}>
              {org.blockedByMe ? null : (
                <ListRow
                  icon={Ban}
                  title={tr('Block {name}', { name: org.name })}
                  subtitle={tr('It stops being able to write to you')}
                  destructive
                  onPress={() => setBlocking(true)}
                  testID="org-block"
                />
              )}
              <ListRow
                icon={Flag}
                title={tr('Report {name}', { name: org.name })}
                subtitle={tr(
                  'Sends it to Caime’s safety team, for a scam or someone posing as another',
                )}
                destructive
                onPress={() => report({ orgId: org.id }, org.name)}
                testID="org-report"
              />
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        open={blocking}
        onClose={() => setBlocking(false)}
        title={tr('Block {name}?', { name: org.name })}
        subtitle={tr(
          'It won’t be able to write to you, and your conversation with it closes. Unblock it here whenever you like.',
        )}
        footer={
          <Button
            label={tr('Block')}
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="org-block-confirm"
            onPress={() =>
              void (async () => {
                if (await run(() => endpoints.blockOrg(org.id), `${org.name} is blocked`)) {
                  setBlocking(false);
                  void qc.invalidateQueries({ queryKey: qk.inbox });
                }
              })()
            }
          />
        }
      >
        <View />
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setPicked(new Set());
        }}
        title={tr('Add to the team')}
        subtitle={tr('People you’re connected with, over 18. They answer for the organization.')}
        footer={
          <Button
            label={
              room !== null && picked.size > room
                ? tr('Room for {room} more', { room })
                : picked.size
                  ? tr('Add {size}', { size: picked.size })
                  : tr('Add')
            }
            block
            size="lg"
            disabled={picked.size === 0 || (room !== null && picked.size > room)}
            loading={busy}
            testID="org-add-confirm"
            onPress={() =>
              void (async () => {
                const n = picked.size;
                if (
                  await run(
                    () => endpoints.addToOrg(org.id, [...picked]),
                    tr('Added {n} to the team', { n }),
                  )
                ) {
                  setAdding(false);
                  setPicked(new Set());
                }
              })()
            }
          />
        }
      >
        {org.plan && room !== null && room < 3 ? (
          <Text
            variant="caption"
            color={room === 0 ? 'danger' : 'textSecondary'}
            style={{ paddingBottom: 8 }}
            testID="org-add-room"
          >
            {room === 0
              ? `${tr('The team is full on the {plan} plan ({n} people).', {
                  plan: PLAN_NAMES[org.plan.plan],
                  n: org.plan.allowance.teamSize,
                })} ${nextOrgPlanLine(org.plan) ?? ''}`.trim()
              : tr('Room for {room} more on the {PLAN_NAMES} plan.', {
                  room,
                  PLAN_NAMES: PLAN_NAMES[org.plan.plan],
                })}
          </Text>
        ) : null}
        <PeoplePicker
          picked={picked}
          exclude={onTeam}
          onToggle={(id) => setPicked((p) => toggled(p, id))}
        />
      </Sheet>

      <Sheet
        open={managing !== null}
        onClose={() => setManaging(null)}
        title={shown?.person.displayName}
        subtitle={shown ? ORG_ROLE_LABELS[shown.role] : undefined}
      >
        {shown && org.myRole ? (
          <View style={{ marginHorizontal: -20 }}>
            {canChangeOrgRole(org.myRole, shown.role) ? (
              <ListRow
                icon={Settings}
                title={shown.role === 'admin' ? tr('Move to the team') : tr('Make an admin')}
                subtitle={
                  shown.role === 'admin'
                    ? tr('They stop managing the team and verification')
                    : tr('Admins add people and verify the domain')
                }
                testID="org-toggle-admin"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    await run(
                      () =>
                        endpoints.updateOrgMember(org.id, who.userId, {
                          role: who.role === 'admin' ? 'agent' : 'admin',
                        }),
                      who.role === 'admin'
                        ? `${who.person.displayName} is on the team`
                        : `${who.person.displayName} is an admin`,
                    );
                  })()
                }
              />
            ) : null}
            {canRemoveFromOrg(org.myRole, shown.role) ? (
              <ListRow
                icon={LogOut}
                title={tr('Remove from the team')}
                destructive
                testID="org-remove"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    await run(
                      () => endpoints.removeFromOrg(org.id, who.userId),
                      `${who.person.displayName} is no longer on the team`,
                    );
                  })()
                }
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title={tr('Close {name}?', { name: org.name })}
        subtitle={tr(
          'Its page goes, its team’s seats end, and its apps stop. Customers keep what they were sent, to read. {text}',
          {
            text:
              org.verified && org.verifiedDomain
                ? `Its handle waits for whoever verifies ${org.verifiedDomain} again, so ${org.name} can come back.`
                : tr('Its handle is held for a year, then free to anyone.'),
          },
        )}
        footer={
          <Button
            label={tr('Close {name}', { name: org.name })}
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="org-close-confirm"
            onPress={() =>
              void (async () => {
                if (await run(() => endpoints.closeOrg(org.id), `${org.name} closed`)) {
                  setClosing(false);
                  router.replace('/orgs');
                }
              })()
            }
          />
        }
      >
        <View />
      </Sheet>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={tr('Leave {name}?', { name: org.name })}
        subtitle={
          handsOverOnLeaving(org.myRole)
            ? org.memberCount > 1
              ? tr(
                  'The admin who has been here longest takes over, or else the longest-standing team member.',
                )
              : tr('You’re the last one here, so it closes.')
            : tr('You stop answering for it. An admin can add you back.')
        }
        footer={
          <Button
            label={tr('Leave')}
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="org-leave-confirm"
            onPress={() =>
              void (async () => {
                if (
                  await run(
                    () => endpoints.removeFromOrg(org.id, me),
                    tr('You left {name}', { name: org.name }),
                  )
                ) {
                  setLeaving(false);
                  router.replace('/orgs');
                }
              })()
            }
          />
        }
      >
        <View />
      </Sheet>
      {manager ? (
        <OrgDetailsSheet
          key={`${org.id}:${editing}`}
          org={org}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={put}
        />
      ) : null}
    </Screen>
  );
}
