import type { OrgMemberView, OrgView } from '@caishy/core/api';
import {
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  ORG_ROLE_LABELS,
  orgKindName,
} from '@caishy/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useOrg } from '@/api/hooks';
import { qk } from '@/api/keys';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { openLink } from '@/lib/links';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, BadgeCheck, Copy, Globe, LogOut, Settings, UserPlus } from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { OrgMark, VerifiedLine } from './kinds';

function CopyRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          borderRadius: 12,
          backgroundColor: t.c.surfaceMuted,
        }}
      >
        <Text
          variant="body"
          selectable
          style={{ flex: 1, fontFamily: 'monospace' }}
          testID={testID}
        >
          {value}
        </Text>
        <IconButton
          icon={Copy}
          label={`Copy the ${label.toLowerCase()}`}
          onPress={() => void Clipboard.setStringAsync(value).then(() => toast(`${label} copied`))}
        />
      </View>
    </View>
  );
}

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
  const [busy, setBusy] = useState(false);

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

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar left={desktop ? undefined : back} title={org.name} />
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
        </View>

        {manager ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
            <Verification org={org} refresh={put} />
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
                const manageable =
                  !self &&
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
                    subtitle={[m.title, ORG_ROLE_LABELS[m.role]].filter(Boolean).join(' · ')}
                    onPress={
                      manageable
                        ? () => setManaging(m)
                        : self
                          ? undefined
                          : () => router.navigate({ pathname: '/p/[id]', params: { id: m.userId } })
                    }
                  />
                );
              })}
            </View>
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
      </ScrollView>

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
            label={picked.size ? `Add ${picked.size}` : 'Add'}
            block
            size="lg"
            disabled={picked.size === 0}
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
