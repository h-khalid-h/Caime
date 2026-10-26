import type { MessageResponse, NextCardResponse } from '@caime/core/api';
import type { MeetingChangeBodyT } from '@caime/core/schemas';
import { api } from '@/api/client';

/**
 * A meeting that changes, and the one next in a conversation (R123). Only the conversation's own
 * chunk reads them (its card's Edit, the form that saves it, the line at its top), so they live
 * here rather than in the startup chunk's endpoints.
 */
export const meetingApi = {
  /** A meeting changed by its organizer: its fields as they should be, and for which times. */
  change: (id: string, body: MeetingChangeBodyT) =>
    api.patch<MessageResponse>(`/messages/${id}/meeting`, body),
  /** The meeting or appointment next in a conversation, for its top line. */
  next: (conversationId: string) =>
    api.get<NextCardResponse>(`/conversations/${conversationId}/next`),
};
