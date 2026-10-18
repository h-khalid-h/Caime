/**
 * Inviting someone new to the team (M16 C3a): a link to share, or one sent to their address,
 * and the invites still open, each taken back with a tap. Whoever accepts joins in the role it
 * gives (an admin only from the owner). Shown in the team's Add sheet, above the people the
 * manager is already connected with; loaded when the sheet opens.
 */

import type { TeamInviteMadeResponse } from '@caime/core/api';
import { formatDayHeading } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { ORG_ROLE_LABELS, TEAM_INVITE_DAYS } from '@caime/core/orgs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'lucide-react-native/icons/link';
import Mail from 'lucide-react-native/icons/mail';
import Share from 'lucide-react-native/icons/share';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { shareLink } from '@/lib/share';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { CopyRow } from '@/ui/CopyRow';
import { IconButton } from '@/ui/IconButton';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

type Role = 'agent' | 'admin';

export function TeamInvites({
  orgId,
  orgName,
  owner,
}: {
  orgId: string;
  orgName: string;
  /** The owner may invite an admin; an admin invites to the team. */
  owner: boolean;
}) {
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const [role, setRole] = useState<Role>('agent');
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<TeamInviteMadeResponse | null>(null);
  const open = useQuery({
    queryKey: qk.teamInvites(orgId),
    queryFn: () => endpoints.teamInvites(orgId),
  });
  const make = useMutation({
    mutationFn: () =>
      endpoints.makeTeamInvite(orgId, { role, ...(email.trim() ? { email: email.trim() } : {}) }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.teamInvites(orgId) });
      if (res.invite.email) {
        toast(tr('Sent to {email}', { email: res.invite.email }), { tone: 'success' });
        setEmail('');
      } else setMade(res);
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => endpoints.revokeTeamInvite(orgId, id),
    onSuccess: (_res, id) => {
      void qc.invalidateQueries({ queryKey: qk.teamInvites(orgId) });
      if (made?.invite.id === id) setMade(null);
      toast(tr('Taken back: its link opens nothing now'));
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const invites = open.data?.invites ?? [];
  return (
    <View style={{ gap: 12, paddingBottom: 16 }} testID="team-invites">
      <View style={{ gap: 4 }}>
        <Text variant="bodyStrong">{tr('Invite someone new')}</Text>
        <Text variant="caption" color="textSecondary">
          {tr(
            'A link to share, or one sent to their address: whoever accepts joins {name}’s team, over 18. It stays open {n} days.',
            { name: orgName, n: TEAM_INVITE_DAYS },
          )}
        </Text>
      </View>
      {owner ? (
        <ChoiceChips<Role>
          label={tr('role')}
          value={role}
          onChange={setRole}
          wrap
          options={[
            { value: 'agent', label: tr(ORG_ROLE_LABELS.agent) },
            { value: 'admin', label: tr(ORG_ROLE_LABELS.admin) },
          ]}
          testID="team-invite-role"
        />
      ) : null}
      <TextField
        label={tr('Their email, to send it')}
        hint={tr('Leave it empty for a link to share.')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="email"
        testID="team-invite-email"
      />
      <Button
        label={email.trim() ? tr('Send the invite') : tr('Make a link')}
        icon={email.trim() ? Mail : Link}
        variant="secondary"
        loading={make.isPending}
        onPress={() => make.mutate()}
        testID="team-invite-make"
      />
      {made ? (
        <View style={{ gap: 8 }} testID="team-invite-made">
          <CopyRow label={tr('Link')} value={made.url} testID="team-invite-link" />
          <Button
            label={tr('Share')}
            icon={Share}
            size="sm"
            variant="secondary"
            onPress={() =>
              void shareLink(tr('Join {name}’s team on Caime', { name: orgName }), made.url)
            }
            testID="team-invite-share"
          />
        </View>
      ) : null}
      {invites.length ? (
        <View style={{ marginHorizontal: -20 }} testID="team-invites-open">
          {invites.map((i) => (
            <ListRow
              key={i.id}
              icon={i.email ? Mail : Link}
              title={i.email ?? tr('A link to share')}
              subtitle={[
                tr(ORG_ROLE_LABELS[i.role]),
                i.uses ? trn(i.uses, 'joined once', 'joined {n} times') : null,
                tr('open until {day}', {
                  day: formatDayHeading(i.expiresAt, new Date(), timeZone, locale),
                }),
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                <IconButton
                  icon={X}
                  label={tr('Take back')}
                  onPress={() => revoke.mutate(i.id)}
                  testID={`team-invite-revoke-${i.id}`}
                />
              }
              testID={`team-invite-${i.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
