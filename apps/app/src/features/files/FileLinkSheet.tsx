/**
 * A link to one of your own files (M16 H6): for someone who isn't in the conversation (an
 * insurer, a lab, a client on email), opened by anyone who has it or only by someone signed in
 * to Caime, for a day, a week or a month, until you take it back. The link is shown once, when
 * it's made; the open ones are listed with how many times each page was opened, never by whom.
 * Opened from the files place (`SharedFiles`); loaded when it's opened.
 */

import type { FileLinkMadeResponse, FileView } from '@caime/core/api';
import {
  FILE_LINK_DAYS,
  FILE_LINK_DEFAULT_DAYS,
  type FileLinkAudience,
  type FileLinkDays,
} from '@caime/core/file-views';
import { formatDayHeading } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
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
import { ChoiceChips } from '@/ui/Chip';
import { CopyRow } from '@/ui/CopyRow';
import { IconButton } from '@/ui/IconButton';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const AUDIENCES: Record<FileLinkAudience, string> = {
  anyone: msg('Anyone with the link'),
  caime: msg('People signed in to Caime'),
};

const SPANS: Record<FileLinkDays, string> = {
  1: msg('A day'),
  7: msg('A week'),
  30: msg('A month'),
};

export function FileLinkSheet({ file, onClose }: { file: FileView; onClose: () => void }) {
  const qc = useQueryClient();
  const { timeZone, locale } = useUserClock();
  const [audience, setAudience] = useState<FileLinkAudience>('anyone');
  const [days, setDays] = useState<FileLinkDays>(FILE_LINK_DEFAULT_DAYS);
  const [made, setMade] = useState<FileLinkMadeResponse | null>(null);
  const open = useQuery({
    queryKey: qk.fileLinks(file.id),
    queryFn: () => endpoints.fileLinks(file.id),
  });
  const make = useMutation({
    mutationFn: () => endpoints.makeFileLink(file.id, { audience, days }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.fileLinks(file.id) });
      setMade(res);
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => endpoints.revokeFileLink(id),
    onSuccess: (_res, id) => {
      void qc.invalidateQueries({ queryKey: qk.fileLinks(file.id) });
      if (made?.link.id === id) setMade(null);
      toast(tr('Taken back: that link opens nothing now'));
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const links = open.data?.links ?? [];
  return (
    <Sheet open onClose={onClose} title={tr('Share by link')} subtitle={file.name}>
      <View style={{ gap: 14, paddingBottom: 16 }} testID="file-link">
        <Text variant="caption" color="textSecondary">
          {tr(
            'For someone who isn’t in the conversation: whoever has the link opens the file, until it runs out or you take it back.',
          )}
        </Text>
        <ChoiceChips<FileLinkAudience>
          label={tr('Who opens it')}
          value={audience}
          onChange={setAudience}
          wrap
          options={(Object.keys(AUDIENCES) as FileLinkAudience[]).map((a) => ({
            value: a,
            label: tr(AUDIENCES[a]),
          }))}
          testID="file-link-audience"
        />
        <ChoiceChips<string>
          label={tr('For how long')}
          value={String(days)}
          onChange={(v) => setDays(Number(v) as FileLinkDays)}
          wrap
          options={FILE_LINK_DAYS.map((d) => ({ value: String(d), label: tr(SPANS[d]) }))}
          testID="file-link-days"
        />
        <Button
          label={tr('Make a link')}
          icon={Link}
          variant="secondary"
          loading={make.isPending}
          onPress={() => make.mutate()}
          testID="file-link-make"
        />
        {made ? (
          <View style={{ gap: 8 }} testID="file-link-made">
            <CopyRow label={tr('Link')} value={made.url} testID="file-link-url" />
            <Button
              label={tr('Share')}
              icon={Share}
              size="sm"
              variant="secondary"
              onPress={() => void shareLink(file.name, made.url)}
              testID="file-link-share"
            />
            <Text variant="caption" color="textTertiary">
              {tr('The link is shown this once: copy it or share it now.')}
            </Text>
          </View>
        ) : null}
        {links.length ? (
          <View style={{ marginHorizontal: -20 }} testID="file-links-open">
            {links.map((l) => (
              <ListRow
                key={l.id}
                icon={Link}
                title={tr(AUDIENCES[l.audience])}
                subtitle={[
                  l.opens ? trn(l.opens, 'opened once', 'opened {n} times') : tr('not opened yet'),
                  tr('open until {day}', {
                    day: formatDayHeading(l.expiresAt, new Date(), timeZone, locale),
                  }),
                ].join(' · ')}
                right={
                  <IconButton
                    icon={X}
                    label={tr('Take back')}
                    onPress={() => revoke.mutate(l.id)}
                    testID={`file-link-revoke-${l.id}`}
                  />
                }
                testID={`file-link-${l.id}`}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
