import type { OrgMemberView, OrgView } from '@caishy/core/api';
import {
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  ORG_ROLE_LABELS,
  orgKindName,
} from '@caishy/core/orgs';
import { PLAN_NAMES } from '@caishy/core/plans';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useBusinessSummary, useOrg } from '@/api/hooks';
import { qk } from '@/api/keys';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { handleLink } from '@/lib/config';
import { openLink } from '@/lib/links';
import { shareLink } from '@/lib/share';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Globe,
  Inbox,
  LogOut,
  MessageCircle,
  Settings,
  Share,
  UserPlus,
} from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { OrgMark, VerifiedLine } from './kinds';
import { OrgAgent } from './OrgAgent';
import { OrgApps } from './OrgApps';
import { OrgInsights } from './OrgInsights';
import { nextOrgPlanLine, OrgPlan } from './OrgPlan';

/** Verify the domain (PRD §55): one TXT record, then "Check now". */
function Verification({ org, refresh }: { org: OrgView; refresh: (o: OrgView) => void }) {
  const t = useTheme();
  const [domain, setDomain] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<'set' | 'check' | null>(null);
  const run = async (
    kind: 'set' | 'check',
    work: () => Promise<{ org: OrgView }>,
    done?: string,
  ) => {
    setBusy(kind);
    try {
      const r = await work();
      refresh(r.org);
      if (done) toast(done);
      setChanging(false);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const d = org.domain;
  if (d?.verified && !changing)
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BadgeCheck size={18} color={t.c.success} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {d.name} is verified
          </Text>
          <Button label="Change" size="sm" variant="ghost" onPress={() => setChanging(true)} />
        </View>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
          Your team shows as “Verified at {org.name}”. Keep the TXT record in place.
        </Text>
      </Card>
    );
  if (!d || changing)
    return (
      <Card>
        <Text variant="bodyStrong">Verify your domain</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
          Prove {org.name} controls its website’s domain with one DNS record. Then your team shows
          as verified, and customers know it’s really you.
        </Text>
        <TextField
          label="Your domain"
          value={domain}
          onChangeText={setDomain}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="datac.com"
          testID="org-domain"
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button
            label="Get the record"
            loading={busy === 'set'}
            testID="org-domain-set"
            onPress={() =>
              void (domain.trim()
                ? run('set', () => endpoints.setOrgDomain(org.id, domain.trim()))
                : toast('Enter your domain, like datac.com.'))
            }
          />
          {changing ? (
            <Button
              label="Keep the current one"
              variant="ghost"
              onPress={() => setChanging(false)}
            />
          ) : null}
        </View>
      </Card>
    );
  return (
    <Card>
      <Text variant="bodyStrong">Add this record to {d.name}</Text>
      <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
        At your domain’s DNS provider, add a TXT record with this name and value, then check.
        Changes can take a few minutes to appear.
      </Text>
      <View style={{ gap: 10 }}>
        <CopyRow label="Name" value={d.record.name} testID="org-record-name" />
        <CopyRow label="Value" value={d.record.value} testID="org-record-value" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button
          label="Check now"
          loading={busy === 'check'}
          testID="org-domain-check"
          onPress={() =>
            void run('check', () => endpoints.checkOrgDomain(org.id), `${d.name} is verified`)
          }
        />
        <Button label="Use another domain" variant="ghost" onPress={() => setChanging(true)} />
      </View>
    </Card>
  );
}

/** An organization (PRD §36): who it is, whether that's verified, and its team. */
export function OrgScreen({ handle }: { handle: string }) {
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
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const minor = useSession((s) => s.user?.minor ?? false);
  const teams = useBusinessSummary(Boolean(org?.myRole)).data?.orgs;
  const waiting = teams?.find((x) => x.org.id === org?.id);

  /** A customer's one conversation with it: theirs if it exists, else a new one (PRD §38). */
  const message = async (orgId: string) => {
    setStarting(true);
    try {
      const { conversationId } = await endpoints.messageOrg(orgId);
      void qc.invalidateQueries({ queryKey: qk.inbox });
      router.push({ pathname: '/c/[id]', params: { id: conversationId } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setStarting(false);
    }
  };

  const put = (o: OrgView) => {
    qc.setQueryData(qk.org(handle), { org: o });
    void qc.invalidateQueries({ queryKey: qk.orgs });
  };
  const reload = () => {
    void qc.invalidateQueries({ queryKey: qk.org(handle) });
    void qc.invalidateQueries({ queryKey: qk.orgs });
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
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/orgs'))}
    />
  );
  if (!org)
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar left={desktop ? undefined : back} title="Organization" />
        {q.isError ? (
          <EmptyState
            title="This organization isn’t here"
            body="It may have closed, or the handle is different."
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
          <IconButton
            icon={Share}
            label={`Share ${org.name}’s link`}
            onPress={() => void shareLink(`${org.name} on Caishy:`, handleLink(org.handle))}
            testID="org-share"
          />
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
          <OrgMark kind={org.kind} size={72} />
          <Text variant="title" align="center" auto>
            {org.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {orgKindName(org.kind)} · @{org.handle}
          </Text>
          <VerifiedLine org={org} />
          {org.about ? (
            <Text variant="body" color="textSecondary" align="center" auto>
              {org.about}
            </Text>
          ) : null}
          {org.website ? (
            <Button
              label={org.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              icon={Globe}
              size="sm"
              variant="ghost"
              style={{ alignSelf: 'center' }}
              onPress={() => openLink(org.website ?? '')}
            />
          ) : null}
          {org.myRole ? null : org.blockedByMe ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 6 }} testID="org-blocked">
              <Text variant="caption" color="textSecondary" align="center">
                {`You blocked ${org.name}. It can’t write to you, and your conversation with it is closed.`}
              </Text>
              <Button
                label={`Unblock ${org.name}`}
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
              Under 18, you can message organizations that have verified who they are.
            </Text>
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Button
                label={`Message ${org.name}`}
                icon={MessageCircle}
                loading={starting}
                style={{ alignSelf: 'center', marginTop: 6 }}
                onPress={() => void message(org.id)}
                testID="org-message"
              />
              {minor ? (
                <Text variant="caption" color="textTertiary" align="center">
                  Its team will see you’re under 18.
                </Text>
              ) : org.agent ? (
                // Before anyone writes, they know an AI answers first (PRD §75).
                <Text variant="caption" color="textTertiary" align="center" testID="org-agent-line">
                  {`${org.agent.name}, its AI agent, answers first and says so. Ask for a person any time.`}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {org.myRole ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Card padded={false}>
              <ListRow
                icon={Inbox}
                title="Inbox"
                subtitle={
                  waiting?.waiting
                    ? `${waiting.waiting} customer${waiting.waiting === 1 ? '' : 's'} waiting${waiting.mine ? ` · ${waiting.mine} yours` : ''}`
                    : 'Customers’ conversations with the team'
                }
                onPress={() =>
                  router.push({ pathname: '/o/[handle]/inbox', params: { handle: org.handle } })
                }
                testID="org-inbox"
              />
            </Card>
          </View>
        ) : null}

        {manager ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 12 }}>
            <Verification org={org} refresh={put} />
            {org.plan?.allowance.insights ? <OrgInsights orgId={org.id} /> : null}
            {org.plan ? <OrgPlan plan={org.plan} /> : null}
          </View>
        ) : null}

        {org.members ? (
          <>
            <SectionTitle
              action={
                manager ? (
                  <Button
                    label="Add"
                    icon={UserPlus}
                    size="sm"
                    variant="ghost"
                    onPress={() => setAdding(true)}
                    testID="org-add-people"
                  />
                ) : undefined
              }
            >
              {`Team · ${org.memberCount}`}
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
                    title={self ? `${m.person.displayName} (you)` : m.person.displayName}
                    subtitle={
                      m.person.kind === 'agent'
                        ? 'AI agent · says so in everything it writes'
                        : bot
                          ? 'Bot · an app’s, labelled automated'
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
            {manager ? <OrgAgent org={org} /> : null}
            {manager ? <OrgApps org={org} /> : null}
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
              <Card padded={false}>
                <ListRow
                  icon={LogOut}
                  title={`Leave ${org.name}`}
                  destructive
                  onPress={() => setLeaving(true)}
                  testID="org-leave"
                />
              </Card>
            </View>
          </>
        ) : (
          <Text
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ paddingHorizontal: 24 }}
          >
            {org.verified
              ? `${org.name} proved it controls ${org.verifiedDomain}.`
              : 'Caishy hasn’t verified who runs this organization. Be careful with links and payments.'}
          </Text>
        )}
        {!org.members && !org.blockedByMe ? (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Card padded={false}>
              <ListRow
                icon={Ban}
                title={`Block ${org.name}`}
                subtitle="It stops being able to write to you"
                destructive
                onPress={() => setBlocking(true)}
                testID="org-block"
              />
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        open={blocking}
        onClose={() => setBlocking(false)}
        title={`Block ${org.name}?`}
        subtitle="It won’t be able to write to you, and your conversation with it closes. Unblock it here whenever you like."
        footer={
          <Button
            label="Block"
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
        title="Add to the team"
        subtitle="People you’re connected with, over 18. They answer for the organization."
        footer={
          <Button
            label={
              room !== null && picked.size > room
                ? `Room for ${room} more`
                : picked.size
                  ? `Add ${picked.size}`
                  : 'Add'
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
                  await run(() => endpoints.addToOrg(org.id, [...picked]), `Added ${n} to the team`)
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
              ? `The team is full on the ${PLAN_NAMES[org.plan.plan]} plan (${org.plan.allowance.teamSize} people). ${nextOrgPlanLine(org.plan) ?? ''}`.trim()
              : `Room for ${room} more on the ${PLAN_NAMES[org.plan.plan]} plan.`}
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
                title={shown.role === 'admin' ? 'Move to the team' : 'Make an admin'}
                subtitle={
                  shown.role === 'admin'
                    ? 'They stop managing the team and verification'
                    : 'Admins add people and verify the domain'
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
                title="Remove from the team"
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
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${org.name}?`}
        subtitle={
          org.myRole === 'owner'
            ? org.memberCount > 1
              ? 'The admin who has been here longest takes over, or else the longest-standing team member.'
              : 'You’re the last one here, so it closes.'
            : 'You stop answering for it. An admin can add you back.'
        }
        footer={
          <Button
            label="Leave"
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="org-leave-confirm"
            onPress={() =>
              void (async () => {
                if (await run(() => endpoints.removeFromOrg(org.id, me), `You left ${org.name}`)) {
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
    </Screen>
  );
}
