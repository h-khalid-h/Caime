/**
 * What another app shares into Caime (R120): the installed web app's share target (the
 * manifest's `share_target`, `GET /share?title&text&url`) lands here, and the words go to the
 * conversations chosen, each as a message of the person's own, sent only by their tap. Never into
 * a private conversation (`SendToSheet` offers none); nothing shared, nothing to send.
 */

import { truncate } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { sharedWords } from '@/lib/shared';
import { lazyPart } from '@/ui/Lazy';
import { Screen } from '@/ui/Screen';
import { toast } from '@/ui/Toast';

const SendToSheet = lazyPart(() =>
  import('@/features/conversation/SendToSheet').then((m) => m.SendToSheet),
);

export default function ShareScreen() {
  const params = useLocalSearchParams<{ title?: string; text?: string; url?: string }>();
  const words = sharedWords(params);
  const qc = useQueryClient();
  // One client id a conversation, kept across a send tried again: it arrives once.
  const ids = useRef(new Map<string, string>());
  const leave = () => router.replace('/');
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when nothing came
  useEffect(() => {
    if (!words) leave();
  }, []);
  if (!words) return null;
  return (
    <Screen>
      <SendToSheet
        exclude={null}
        title={tr('Share to Caime')}
        subtitle={truncate(words, 200)}
        nowhere={tr('There’s no conversation to share it to yet.')}
        onSend={async (conversationIds) => {
          for (const id of conversationIds) {
            const clientId = ids.current.get(id) ?? uuidv4();
            ids.current.set(id, clientId);
            await endpoints.send(id, { clientId, kind: 'text', body: words });
          }
          toast(trn(conversationIds.length, 'Shared', 'Shared to {n} conversations'));
          void qc.invalidateQueries({ queryKey: qk.inboxAll });
        }}
        onClose={leave}
        testID="share"
      />
    </Screen>
  );
}
