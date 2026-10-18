import type { MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { patchMessage, removeMessage, restoreMessage } from '@/state/cache';
import { toast } from '@/ui/Toast';

/** How long Undo is offered: as long as a toast with an action stays. */
const UNDO_MS = 6000;

const waiting = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; send: (keepalive: boolean) => void }
>();

/**
 * A delete with Undo (M16 E1, review 2026-10-17 §7): it shows at once and goes to the server
 * only once Undo has passed, so taking it back is exact (nothing was erased, nothing kept of it
 * dropped, nobody told). Leaving the app sends whatever is still waiting, as it goes.
 */
export function deleteWithUndo(qc: QueryClient, m: MessageView, forEveryone: boolean): void {
  if (waiting.has(m.id)) return;
  if (forEveryone)
    patchMessage(qc, m.conversationId, m.id, (x) => ({
      ...x,
      body: null,
      files: [],
      deletedAt: new Date().toISOString(),
    }));
  else removeMessage(qc, m.conversationId, m.id);
  const send = (keepalive: boolean) => {
    waiting.delete(m.id);
    endpoints.deleteMessage(m.id, forEveryone, { keepalive }).catch((e) => {
      restoreMessage(qc, m);
      toast((e as Error).message, { tone: 'danger' });
    });
  };
  const timer = setTimeout(() => send(false), UNDO_MS);
  waiting.set(m.id, { timer, send });
  toast(forEveryone ? tr('Deleted for everyone') : tr('Deleted for you'), {
    action: {
      label: tr('Undo'),
      onPress: () => {
        clearTimeout(timer);
        waiting.delete(m.id);
        restoreMessage(qc, m);
      },
    },
  });
}

/** What's still waiting goes now: the tab is closing, or the app is put away. */
function sendWaiting() {
  for (const { timer, send } of [...waiting.values()]) {
    clearTimeout(timer);
    send(true);
  }
}
if (Platform.OS === 'web') {
  if (typeof window !== 'undefined') window.addEventListener('pagehide', sendWaiting);
} else
  AppState.addEventListener('change', (state) => {
    if (state === 'background') sendWaiting();
  });
