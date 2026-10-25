/**
 * Forward a message (PRD §22) to other conversations, up to 20 at once, through the one sheet
 * that sends something on (`SendToSheet`: never a private conversation nor a request that has had
 * its one message). It arrives marked as forwarded, and goes to all of them or none.
 */
import type { MessageView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { lazyPart } from '@/ui/Lazy';
import { toast } from '@/ui/Toast';

const SendToSheet = lazyPart(() => import('./SendToSheet').then((m) => m.SendToSheet));

export function ForwardSheet({ m, onClose }: { m: MessageView; onClose: () => void }) {
  const qc = useQueryClient();
  return (
    <SendToSheet
      exclude={m.conversationId}
      title={tr('Forward')}
      subtitle={tr('It arrives marked as forwarded.')}
      nowhere={tr('There’s nowhere else to forward it yet.')}
      onSend={async (conversationIds, clientId) => {
        await endpoints.forward(m.id, conversationIds, clientId);
        toast(trn(conversationIds.length, 'Forwarded', 'Forwarded to {n} conversations'));
        void qc.invalidateQueries({ queryKey: qk.inbox });
        void qc.invalidateQueries({ queryKey: qk.inboxAll });
      }}
      onClose={onClose}
    />
  );
}
