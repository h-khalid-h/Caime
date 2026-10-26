/**
 * Forward a message (PRD §22), or several chosen together (M16 E8), to other conversations, up to
 * 20 at once, through the one sheet that sends something on (`SendToSheet`: never a private
 * conversation nor a request that has had its one message). Each arrives marked as forwarded, in
 * the order it was said, and each goes to all of them or none. Each message keeps its own client
 * id for the sheet's life, so a send tried again after an answer that never came arrives once.
 */
import type { MessageView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { lazyPart } from '@/ui/Lazy';
import { toast } from '@/ui/Toast';

const SendToSheet = lazyPart(() => import('./SendToSheet').then((m) => m.SendToSheet));

export function ForwardSheet({ ms, onClose }: { ms: MessageView[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [ids] = useState(() => new Map(ms.map((m) => [m.id, uuidv4()])));
  const many = ms.length > 1;
  return (
    <SendToSheet
      exclude={ms[0]?.conversationId ?? null}
      title={tr('Forward')}
      subtitle={
        many ? tr('They arrive marked as forwarded.') : tr('It arrives marked as forwarded.')
      }
      nowhere={
        many
          ? tr('There’s nowhere else to forward them yet.')
          : tr('There’s nowhere else to forward it yet.')
      }
      onSend={async (conversationIds) => {
        for (const m of [...ms].sort((a, b) => a.seq - b.seq))
          await endpoints.forward(m.id, conversationIds, ids.get(m.id) ?? uuidv4());
        toast(trn(conversationIds.length, 'Forwarded', 'Forwarded to {n} conversations'));
        void qc.invalidateQueries({ queryKey: qk.inbox });
        void qc.invalidateQueries({ queryKey: qk.inboxAll });
      }}
      onClose={onClose}
    />
  );
}
