/** Opening the conversation with someone: theirs if there is one, else a new one. */
import type { ConnectionView } from '@caime/core/api';
import { router } from 'expo-router';
import { endpoints } from '@/api/endpoints';
import { toast } from '@/ui/Toast';

export async function openChatWith(c: Pick<ConnectionView, 'conversationId' | 'person'>) {
  if (c.conversationId) {
    router.navigate({ pathname: '/c/[id]', params: { id: c.conversationId } });
    return;
  }
  await openDirectWith(c.person.id);
}

/** The conversation with someone, made when there's none: Cai and the Caime Friends too (R67). */
export async function openDirectWith(userId: string) {
  try {
    const { conversation } = await endpoints.openDirect(userId);
    router.navigate({ pathname: '/c/[id]', params: { id: conversation.id } });
  } catch (e) {
    toast((e as Error).message, { tone: 'danger' });
  }
}
