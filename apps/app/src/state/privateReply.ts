/**
 * A group's message being answered privately (M16 E3b): set from the message's sheet, taken by
 * the chat it opens, until it's sent or put aside. In memory only: the words stay the group's.
 */
import type { PrivateReplyView } from '@caime/core/api';
import { create } from 'zustand';

export interface PrivateReplyDraft {
  /** The chat it's written in. */
  in: string;
  /** Who wrote the group's message, as the reader knows them. */
  name: string | null;
  quote: PrivateReplyView;
}

export const usePrivateReply = create<{
  draft: PrivateReplyDraft | null;
  set: (draft: PrivateReplyDraft | null) => void;
}>((set) => ({ draft: null, set: (draft) => set({ draft }) }));
