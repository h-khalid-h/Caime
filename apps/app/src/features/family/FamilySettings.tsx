/**
 * Settings · Family (R122): a parent's children on Caime, what waits on their yes, and a link to
 * add one; for a child, their parent and what that parent sees. Whom a child is connected with
 * shows here while the parent's say holds, never a message. Where the law asks a parent's
 * consent (Egypt, Saudi Arabia), a child from 13 joins with it: through the parent's link, or by
 * asking the parent themselves (R122 (2)), whose yes vouches for the day of birth it shows. A
 * child's link to a parent lands here (`?ask=`), and a correction the child asked of their parent
 * (a day of birth, a country) waits here for that parent's yes. A parent may also say yes to every
 * new way in (Moderate): an invitation, an ask to join, a message request, an organization to
 * write to, each waiting here; the child sees what waits on them, and never a message's words.
 */

import type { FamilyChildView, FamilyLinkResponse, FamilyModerateAskView } from '@caime/core/api';
import { formatDayHeading, joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Link from 'lucide-react-native/icons/link';
import Share from 'lucide-react-native/icons/share';
import X from 'lucide-react-native/icons/x';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { qk } from '@/api/keys';
import { familyApi } from '@/features/family/api';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { shareLink } from '@/lib/share';
import { useUserClock } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { formatDay } from '@/ui/dates';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const LoadFailed = lazyPart(() => import('@/ui/LoadFailed').then((m) => m.LoadFailed));

export function FamilySettings() {
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const q = useQuery({ queryKey: qk.family, queryFn: familyApi.family });
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.family });
  const fail = (e: unknown) => toast((e as Error).message, { tone: 'danger' });
  const [childName, setChildName] = useState('');
  const [made, setMade] = useState<FamilyLinkResponse | null>(null);
  const [withdrawing, setWithdrawing] = useState<FamilyChildView | null>(null);
  const [password, setPassword] = useState('');
  // Moderate, chosen as the parent agrees (off unless they turn it on).
  const [moderating, setModerating] = useState<Record<string, boolean>>({});
  const make = useMutation({
    mutationFn: () => familyApi.makeLink(childName.trim()),
    onSuccess: (res) => {
      setMade(res);
      setChildName('');
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => familyApi.revokeLink(id),
    onSuccess: (_r, id) => {
      if (made?.link.id === id) setMade(null);
      refresh();
      toast(tr('Taken back: its link opens nothing now'));
    },
    onError: fail,
  });
  const answer = useMutation({
    mutationFn: (v: { id: string; answer: 'consent' | 'refuse' }) =>
      familyApi.answerChild(v.id, v.answer, moderating[v.id] ?? false),
    onSuccess: (_r, v) => {
      refresh();
      toast(
        v.answer === 'consent'
          ? tr('Agreed. You’re connected now.')
          : tr('That account is deleted.'),
      );
    },
    onError: fail,
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; answer: 'allow' | 'decline' }) =>
      familyApi.answerRequest(v.id, v.answer),
    onSuccess: refresh,
    onError: fail,
  });
  const moderate = useMutation({
    mutationFn: (v: { id: string; moderates: boolean }) => familyApi.moderate(v.id, v.moderates),
    onSuccess: refresh,
    onError: fail,
  });
  const allow = useMutation({
    mutationFn: (v: { id: string; answer: 'allow' | 'decline' }) =>
      familyApi.answerAsk(v.id, v.answer),
    onSuccess: refresh,
    onError: fail,
  });
  const correct = useMutation({
    mutationFn: (v: { id: string; answer: 'agree' | 'decline' }) =>
      familyApi.answerCorrection(v.id, v.answer),
    onSuccess: refresh,
    onError: fail,
  });
  // A child's link to their parent (R122 (2)), opened signed in: they're the one asked now.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const took = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once a link
  useEffect(() => {
    if (!ask || took.current === ask) return;
    took.current = ask;
    familyApi
      .takeAsk(ask)
      .then((res) => {
        toast(tr('{name} asks you to agree to their account', { name: res.child.displayName }));
        refresh();
      })
      .catch(fail)
      .finally(() => router.setParams({ ask: undefined }));
  }, [ask]);
  const withdraw = useMutation({
    mutationFn: (v: { id: string; password: string }) => familyApi.withdrawChild(v.id, v.password),
    onSuccess: () => {
      setWithdrawing(null);
      setPassword('');
      refresh();
      toast(tr('That account is deleted.'));
    },
    onError: fail,
  });
  const day = (at: string) => formatDayHeading(at, new Date(), timeZone, locale);
  const data = q.data;

  if (!data)
    return (
      <SettingsPage title={tr('Family')}>
        {q.isError ? (
          <LoadFailed title={tr('Family')} error={q.error} onRetry={() => void q.refetch()} />
        ) : null}
      </SettingsPage>
    );

  return (
    <SettingsPage title={tr('Family')}>
      {data.guardian ? (
        <Group
          title={tr('Your parent')}
          footer={
            data.guardian.supervised
              ? tr(
                  'They see whom you’re connected with, and a request to connect waits for their yes. Never your messages.',
                )
              : undefined
          }
        >
          <ListRow
            left={
              <Avatar
                id={data.guardian.person.id}
                name={data.guardian.person.displayName}
                url={data.guardian.person.avatarUrl}
                size={36}
              />
            }
            title={data.guardian.person.displayName}
            subtitle={data.guardian.agreed ? tr('Agreed to your account') : tr('Hasn’t agreed yet')}
            testID="family-parent"
          />
          {data.guardian.moderates ? (
            <ListRow
              title={tr('Your parent says yes to new groups, spaces and people first')}
              subtitle={tr(
                'An invitation, a message request or writing to an organization waits for them.',
              )}
              testID="family-moderated"
            />
          ) : null}
          {data.guardian.waitingAsks.map((a) => (
            <ListRow
              key={a.id}
              title={waitsLine(a)}
              subtitle={day(a.createdAt)}
              testID={`family-waits-${a.kind}`}
            />
          ))}
          {data.guardian.correctionAsked ? (
            <ListRow
              title={tr('Your correction waits for your parent')}
              subtitle={tr('It changes once they agree.')}
              testID="family-correction-waiting"
            />
          ) : null}
          {data.guardian.waiting.map((p) => (
            <ListRow
              key={p.id}
              left={<Avatar id={p.id} name={p.displayName} url={p.avatarUrl} size={36} />}
              title={p.displayName}
              subtitle={tr('Your request waits for your parent')}
              testID={`family-waiting-${p.id}`}
            />
          ))}
        </Group>
      ) : null}

      {data.requests.length || data.asks.length ? (
        <Group title={tr('Waiting for your yes')}>
          {data.asks.map((a) => (
            <View key={a.id} style={{ padding: 16, gap: 10 }} testID="family-ask">
              <Text variant="bodyStrong">{askLine(a)}</Text>
              {a.kind === 'request' ? (
                <Text variant="caption" color="textSecondary">
                  {tr('Allowing lets them read it and answer. You never see their messages.')}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  label={tr('Allow')}
                  size="sm"
                  loading={allow.isPending && allow.variables?.id === a.id}
                  onPress={() => allow.mutate({ id: a.id, answer: 'allow' })}
                  testID="family-ask-allow"
                />
                <Button
                  label={tr('Decline')}
                  size="sm"
                  variant="secondary"
                  onPress={() => allow.mutate({ id: a.id, answer: 'decline' })}
                  testID="family-ask-decline"
                />
                {a.person ? (
                  <Button
                    label={tr('See {name}', { name: a.person.displayName })}
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      a.person &&
                      router.navigate({ pathname: '/p/[id]', params: { id: a.person.id } })
                    }
                  />
                ) : null}
              </View>
            </View>
          ))}
          {data.requests.map((r) => (
            <View key={r.requestId} style={{ padding: 16, gap: 10 }} testID="family-request">
              <Text variant="bodyStrong">
                {r.byChild
                  ? tr('{child} wants to connect with {name}', {
                      child: r.child.displayName,
                      name: r.person.displayName,
                    })
                  : tr('{name} wants to connect with {child}', {
                      child: r.child.displayName,
                      name: r.person.displayName,
                    })}
              </Text>
              {r.note ? (
                <Text color="textSecondary" auto>
                  {r.note}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  label={tr('Allow')}
                  size="sm"
                  loading={decide.isPending && decide.variables?.id === r.requestId}
                  onPress={() => decide.mutate({ id: r.requestId, answer: 'allow' })}
                  testID="family-request-allow"
                />
                <Button
                  label={tr('Decline')}
                  size="sm"
                  variant="secondary"
                  onPress={() => decide.mutate({ id: r.requestId, answer: 'decline' })}
                  testID="family-request-decline"
                />
                <Button
                  label={tr('See {name}', { name: r.person.displayName })}
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    router.navigate({ pathname: '/p/[id]', params: { id: r.person.id } })
                  }
                />
              </View>
            </View>
          ))}
        </Group>
      ) : null}

      {data.children.length ? (
        <Group title={tr('Your children')}>
          {data.children.map((c) => (
            <View key={c.person.id} testID={`family-child-${c.person.id}`}>
              <ListRow
                left={
                  <Avatar
                    id={c.person.id}
                    name={c.person.displayName}
                    url={c.person.avatarUrl}
                    size={36}
                  />
                }
                title={c.person.displayName}
                subtitle={
                  c.state === 'asked'
                    ? [tr('Waiting for your yes'), day(c.askedAt)].join(' · ')
                    : c.supervised
                      ? [tr('You agreed'), day(c.agreedAt ?? c.askedAt)].join(' · ')
                      : tr('Old enough where they live: your say has ended')
                }
              />
              {c.state === 'asked' ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
                  {c.how === 'named' ? (
                    <Text variant="bodyStrong" testID="family-named">
                      {tr('{name} says you’re their parent or guardian', {
                        name: c.person.displayName,
                      })}
                    </Text>
                  ) : null}
                  {c.birthDate ? (
                    <Text testID="family-birth-date">
                      {tr('Their date of birth: {day}. Agreeing confirms it.', {
                        day: formatDay(c.birthDate, locale),
                      })}
                    </Text>
                  ) : null}
                  <Text variant="caption" color="textSecondary">
                    {c.how === 'named'
                      ? tr(
                          'Agreeing lets their account in and connects you. You’ll see whom they’re connected with and who asks to connect with them, never their messages. If it isn’t your child’s, say so: you won’t be asked again.',
                        )
                      : tr(
                          'Agreeing lets their account in and connects you. You’ll see whom they’re connected with and who asks to connect with them, never their messages. If it isn’t your child’s, say so and the account is deleted.',
                        )}
                  </Text>
                  <SwitchRow
                    label={tr('Say yes to new groups, spaces and people first')}
                    detail={tr(
                      'An invitation, a message request or writing to an organization waits for you too. You can change it later.',
                    )}
                    value={moderating[c.person.id] ?? false}
                    onChange={(v) => setModerating((m) => ({ ...m, [c.person.id]: v }))}
                    testID="family-moderate-agree"
                  />
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      label={tr('Agree')}
                      size="sm"
                      loading={answer.isPending && answer.variables?.answer === 'consent'}
                      onPress={() => answer.mutate({ id: c.person.id, answer: 'consent' })}
                      testID="family-agree"
                    />
                    <Button
                      label={tr('Not my child')}
                      size="sm"
                      variant="secondary"
                      onPress={() => answer.mutate({ id: c.person.id, answer: 'refuse' })}
                      testID="family-not-mine"
                    />
                  </View>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
                  {c.correction ? (
                    <View style={{ gap: 8 }} testID="family-correction">
                      <Text variant="bodyStrong">
                        {c.correction.birthDate
                          ? tr('{name} asks to correct their date of birth to {day}', {
                              name: c.person.displayName,
                              day: formatDay(c.correction.birthDate, locale),
                            })
                          : tr('{name} asks to change where they live to {country}', {
                              name: c.person.displayName,
                              country: c.correction.countryName ?? c.correction.country ?? '',
                            })}
                      </Text>
                      {c.correction.fromBirthDate ? (
                        <Text variant="caption" color="textSecondary">
                          {tr('Now {day}', { day: formatDay(c.correction.fromBirthDate, locale) })}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          label={tr('Agree')}
                          size="sm"
                          loading={correct.isPending && correct.variables?.answer === 'agree'}
                          onPress={() => correct.mutate({ id: c.person.id, answer: 'agree' })}
                          testID="family-correction-agree"
                        />
                        <Button
                          label={tr('Decline')}
                          size="sm"
                          variant="secondary"
                          onPress={() => correct.mutate({ id: c.person.id, answer: 'decline' })}
                          testID="family-correction-decline"
                        />
                      </View>
                    </View>
                  ) : null}
                  {c.supervised ? (
                    <SwitchRow
                      label={tr('Say yes to new groups, spaces and people first')}
                      detail={tr(
                        'An invitation, a message request or writing to an organization waits for you. Never their messages.',
                      )}
                      value={
                        moderate.isPending
                          ? (moderate.variables?.moderates ?? c.moderates)
                          : c.moderates
                      }
                      disabled={moderate.isPending}
                      onChange={(v) => moderate.mutate({ id: c.person.id, moderates: v })}
                      testID={`family-moderate-${c.person.id}`}
                    />
                  ) : null}
                  {c.supervised ? (
                    <Text variant="caption" color="textSecondary" testID="family-connections">
                      {c.connections.length
                        ? tr('Connected with {names}', {
                            names: joinNames(
                              c.connections.map((p) => p.displayName),
                              c.connections.length,
                            ),
                          })
                        : tr('Connected with nobody else yet')}
                    </Text>
                  ) : null}
                  <Button
                    label={tr('End my consent')}
                    size="sm"
                    variant="ghost"
                    onPress={() => setWithdrawing(c)}
                    testID="family-withdraw"
                  />
                </View>
              )}
            </View>
          ))}
        </Group>
      ) : null}

      {data.mayAdd ? (
        <Group
          title={tr('Add a child')}
          footer={tr(
            'Your child makes their own account through this link, on their own phone, and you agree to it here. Under 13, nobody joins Caime.',
          )}
        >
          <View style={{ padding: 16, gap: 12 }}>
            <TextField
              label={tr('Their first name')}
              value={childName}
              onChangeText={setChildName}
              autoCapitalize="words"
              testID="family-child-name"
            />
            <Button
              label={tr('Make a link')}
              icon={Link}
              variant="secondary"
              disabled={!childName.trim()}
              loading={make.isPending}
              onPress={() => make.mutate()}
              testID="family-link-make"
            />
            {made ? (
              <View style={{ gap: 8 }} testID="family-link-made">
                <CopyRow label={tr('Link')} value={made.url} testID="family-link-url" />
                <Button
                  label={tr('Share')}
                  icon={Share}
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    void shareLink(
                      tr('Your account on Caime, {name}', { name: made.link.childName }),
                      made.url,
                    )
                  }
                />
              </View>
            ) : null}
          </View>
          {data.links.map((l) => (
            <ListRow
              key={l.id}
              icon={Link}
              title={tr('A link for {name}', { name: l.childName })}
              subtitle={tr('open until {day}', { day: day(l.expiresAt) })}
              right={
                <IconButton
                  icon={X}
                  label={tr('Take back')}
                  onPress={() => revoke.mutate(l.id)}
                  testID={`family-link-revoke-${l.id}`}
                />
              }
            />
          ))}
        </Group>
      ) : !data.guardian ? (
        <Text color="textSecondary">{tr('Only an adult adds a child to Caime.')}</Text>
      ) : null}

      <Sheet
        open={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={tr('End your consent')}
        subtitle={
          withdrawing
            ? tr('{name}’s account is deleted, with everything in it. This can’t be undone.', {
                name: withdrawing.person.displayName,
              })
            : undefined
        }
      >
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Your password')}
            secret
            value={password}
            onChangeText={setPassword}
            testID="family-withdraw-password"
          />
          <Button
            label={tr('Delete their account')}
            variant="danger"
            disabled={!password}
            loading={withdraw.isPending}
            onPress={() => withdrawing && withdraw.mutate({ id: withdrawing.person.id, password })}
            testID="family-withdraw-confirm"
          />
        </View>
      </Sheet>
    </SettingsPage>
  );
}

/** What waits on a parent's yes, in the words the parent reads (R122 (2), Moderate). */
function askLine(a: FamilyModerateAskView): string {
  const child = a.child?.displayName ?? '';
  const place = a.place ?? '';
  if (a.kind === 'invite')
    return a.person
      ? tr('{name} invited {child} to “{place}”', { name: a.person.displayName, child, place })
      : tr('{child} was invited to “{place}”', { child, place });
  if (a.kind === 'join') return tr('{child} asks to join “{place}”', { child, place });
  if (a.kind === 'request')
    return tr('{name} wrote to {child}', { name: a.person?.displayName ?? '', child });
  return tr('{child} wants to write to {org}', { child, org: a.org?.name ?? '' });
}

/** The same, as the child reads it: what waits on their parent. */
function waitsLine(a: FamilyModerateAskView): string {
  const place = a.place ?? '';
  if (a.kind === 'invite') return tr('“{place}” waits for your parent', { place });
  if (a.kind === 'join') return tr('Joining “{place}” waits for your parent', { place });
  if (a.kind === 'request')
    return tr('{name}’s message waits for your parent', { name: a.person?.displayName ?? '' });
  return tr('Writing to {org} waits for your parent', { org: a.org?.name ?? '' });
}
