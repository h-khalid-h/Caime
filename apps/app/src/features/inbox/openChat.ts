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
  try {
    const { conversation } = await endpoints.openDirect(c.person.id);
    router.navigate({ pathname: '/c/[id]', params: { id: conversation.id } });
  } catch (e) {
    toast((e as Error).message, { tone: 'danger' });
  }
}
