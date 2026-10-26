import type { SearchCallHit } from '@caime/core/api';
import { formatListTime, snippetParts } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Phone from 'lucide-react-native/icons/phone';
import { useNow, useUserClock } from '@/lib/time';
import { ListRow } from '@/ui/ListRow';

/** Opens a call's notes where a hit is: at the call's line in its conversation, at the line said. */
export function openCallHit(
  hit: Pick<SearchCallHit, 'conversationId' | 'seq' | 'callId' | 'lineId'>,
) {
  router.navigate({
    pathname: '/c/[id]',
    params: {
      id: hit.conversationId,
      seq: String(hit.seq),
      notes: hit.callId,
      ...(hit.lineId ? { line: hit.lineId } : {}),
    },
  });
}

/**
 * What was said in a call, as Search lists it and as an answer cites it (M17 I12a): who said it,
 * the words around the match and when; or Cai's write-up of the call, by where the call was. A tap
 * opens the call's notes at it.
 */
export function CallHitRow({
  hit,
  open,
  testID,
}: {
  hit: SearchCallHit;
  open: (go: () => void) => void;
  testID: string;
}) {
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const when = formatListTime(hit.at, now, timeZone, locale);
  const parts = hit.lineId
    ? [...snippetParts(hit.snippet), { text: ` · ${when}`, match: false }]
    : [{ text: hit.conversationTitle ? `${hit.conversationTitle} · ${when}` : when, match: false }];
  return (
    <ListRow
      icon={hit.lineId ? Phone : NotebookPen}
      title={hit.lineId ? hit.speakerName : tr('Notes from the call')}
      subtitle={parts.map((p) => p.text).join('')}
      subtitleParts={parts}
      onPress={() => open(() => openCallHit(hit))}
      testID={testID}
    />
  );
}
