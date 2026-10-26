import type { MessageView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import type { QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { applyEditToInbox, patchMessage, removeMessage, restoreMessage } from '@/state/cache';
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
 * dropped, nobody told). Leaving the app sends whatever is still waiting, as it goes. Several
 * chosen together (M16 E8) go as one: one toast, one Undo that puts every one back.
 */
export function deleteWithUndo(
  qc: QueryClient,
  chosen: MessageView | MessageView[],
  forEveryone: boolean,
): void {
  const ms = (Array.isArray(chosen) ? chosen : [chosen]).filter((m) => !waiting.has(m.id));
  if (!ms.length) return;
  const gone = { body: null, files: [], deletedAt: new Date().toISOString() };
  for (const m of ms) {
    if (forEveryone) {
      patchMessage(qc, m.conversationId, m.id, (x) => ({ ...x, ...gone }));
      // Its row in Chats says so too, when it's the last thing said there.
      applyEditToInbox(qc, { ...m, ...gone });
    } else removeMessage(qc, m.conversationId, m.id);
  }
  const putBack = (m: MessageView) => {
    restoreMessage(qc, m);
    if (forEveryone) applyEditToInbox(qc, m);
  };
  const timer = setTimeout(() => {
    for (const m of ms) waiting.get(m.id)?.send(false);
  }, UNDO_MS);
  for (const m of ms) {
    const send = (keepalive: boolean) => {
      waiting.delete(m.id);
      endpoints.deleteMessage(m.id, forEveryone, { keepalive }).catch((e) => {
        putBack(m);
        toast((e as Error).message, { tone: 'danger' });
      });
    };
    waiting.set(m.id, { timer, send });
  }
  const said = forEveryone
    ? tr('Deleted for everyone')
    : ms.length === 1
      ? tr('Deleted for you')
      : trn(ms.length, 'Deleted for you', '{n} messages deleted for you');
  toast(said, {
    action: {
      label: tr('Undo'),
      onPress: () => {
        clearTimeout(timer);
        // Only what hasn't gone yet (leaving the app sends what's waiting) comes back.
        for (const m of ms) if (waiting.delete(m.id)) putBack(m);
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
