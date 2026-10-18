/**
 * A link to join a group or a space (M16 C3e): made by its owner or admins, to post where its
 * people already are (a WhatsApp group, a class's mailing list), so they come over in one message
 * rather than each being added by someone they're connected with. Whoever opens it joins, over 18,
 * and reads what was said before; the open links are listed, each taken back with a tap. Shown in
 * the group's and the space's Add sheet, and from a group just made with nobody yet; loaded when
 * shown.
 */

import type { JoinLinkMadeResponse } from '@caime/core/api';
import { formatDayHeading } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { JOIN_LINK_DAYS } from '@caime/core/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'lucide-react-native/icons/link';
import Share from 'lucide-react-native/icons/share';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { shareLink } from '@/lib/share';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { IconButton } from '@/ui/IconButton';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function JoinLinks({
  target,
  id,
  name,
}: {
  target: 'group' | 'space';
  id: string;
  /** The group's or the space's name, for the words a link is shared with. */
  name: string;
}) {
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const [made, setMade] = useState<JoinLinkMadeResponse | null>(null);
  const open = useQuery({
    queryKey: qk.joinLinks(target, id),
    queryFn: () => endpoints.joinLinks(target, id),
  });
  const make = useMutation({
    mutationFn: () => endpoints.makeJoinLink(target, id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.joinLinks(target, id) });
      setMade(res);
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => endpoints.revokeJoinLink(target, id, linkId),
    onSuccess: (_res, linkId) => {
      void qc.invalidateQueries({ queryKey: qk.joinLinks(target, id) });
      if (made?.link.id === linkId) setMade(null);
      toast(tr('Taken back: its link opens nothing now'));
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const links = open.data?.links ?? [];
  return (
    <View style={{ gap: 12, paddingBottom: 16 }} testID="join-links">
      <View style={{ gap: 4 }}>
        <Text variant="bodyStrong">{tr('Invite with a link')}</Text>
        <Text variant="caption" color="textSecondary">
          {target === 'space'
            ? trn(
                JOIN_LINK_DAYS,
                'Post it where its people already are: whoever opens it joins the space, over 18, and reads what was said before. It stays open {n} day.',
                'Post it where its people already are: whoever opens it joins the space, over 18, and reads what was said before. It stays open {n} days.',
              )
            : trn(
                JOIN_LINK_DAYS,
                'Post it where its people already are: whoever opens it joins the group, over 18, and reads what was said before. It stays open {n} day.',
                'Post it where its people already are: whoever opens it joins the group, over 18, and reads what was said before. It stays open {n} days.',
              )}
        </Text>
      </View>
      <Button
        label={tr('Make a link')}
        icon={Link}
        variant="secondary"
        loading={make.isPending}
        onPress={() => make.mutate()}
        testID="join-link-make"
      />
      {made ? (
        <View style={{ gap: 8 }} testID="join-link-made">
          <CopyRow label={tr('Link')} value={made.url} testID="join-link-url" />
          <Button
            label={tr('Share')}
            icon={Share}
            size="sm"
            variant="secondary"
            onPress={() => void shareLink(tr('Join “{place}” on Caime', { place: name }), made.url)}
            testID="join-link-share"
          />
        </View>
      ) : null}
      {links.length ? (
        <View style={{ marginHorizontal: -20 }} testID="join-links-open">
          {links.map((l) => (
            <ListRow
              key={l.id}
              icon={Link}
              title={l.by ? tr('A link from {name}', { name: l.by }) : tr('A link to share')}
              subtitle={[
                l.uses ? trn(l.uses, 'joined once', 'joined {n} times') : null,
                tr('open until {day}', {
                  day: formatDayHeading(l.expiresAt, new Date(), timeZone, locale),
                }),
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                <IconButton
                  icon={X}
                  label={tr('Take back')}
                  onPress={() => revoke.mutate(l.id)}
                  testID={`join-link-revoke-${l.id}`}
                />
              }
              testID={`join-link-${l.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
