import type { ConversationView } from '@caime/core/api';

/**
 * Whether anything of a conversation may be saved (the server's rules): never a private one's,
 * nor a message request's until it's accepted, nor once it's declined. Apart from the files
 * place (`SharedFiles`), which loads only when it's opened.
 */
export function mayKeepFrom(conversation: ConversationView): boolean {
  const state = conversation.me.requestState;
  return conversation.privacyClass !== 'private' && state !== 'pending' && state !== 'declined';
}
