import type {
  FamilyAskTakenResponse,
  FamilyLinkResponse,
  FamilyResponse,
  OkResponse,
} from '@caime/core/api';
import { api } from '@/api/client';

/**
 * A child on Caime with a parent's consent (R122): a parent's children, links and the requests
 * waiting on them, or a child's own parent. Only Family and a child's wait read them, both loaded
 * when shown, so they live here rather than in the startup chunk's endpoints.
 */
export const familyApi = {
  family: () => api.get<FamilyResponse>('/me/family'),
  makeLink: (childName: string) => api.post<FamilyLinkResponse>('/me/family/links', { childName }),
  revokeLink: (id: string) => api.del<OkResponse>(`/me/family/links/${id}`),
  answerChild: (childId: string, answer: 'consent' | 'refuse', moderates = false) =>
    api.post<OkResponse>(
      `/me/family/children/${childId}/${answer}`,
      answer === 'consent' ? { moderates } : undefined,
    ),
  // Moderate (R122 (2)): the parent's yes to every new way in, and their answer to what waits.
  moderate: (childId: string, moderates: boolean) =>
    api.patch<OkResponse>(`/me/family/children/${childId}`, { moderates }),
  answerAsk: (id: string, answer: 'allow' | 'decline') =>
    api.post<OkResponse>(`/me/family/asks/${id}/${answer}`),
  withdrawChild: (childId: string, password: string) =>
    api.post<OkResponse>(`/me/family/children/${childId}/withdraw`, { password }),
  answerRequest: (id: string, answer: 'allow' | 'decline') =>
    api.post<OkResponse>(`/me/family/requests/${id}/${answer}`),
  answerCorrection: (childId: string, answer: 'agree' | 'decline') =>
    api.post<OkResponse>(`/me/family/children/${childId}/correction/${answer}`),
  takeAsk: (token: string) => api.post<FamilyAskTakenResponse>('/me/family/asks', { token }),
};
