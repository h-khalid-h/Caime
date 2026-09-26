/**
 * Every call the app makes, typed by the shared contract (@caishy/core/api). Screens call these
 * through TanStack Query; nothing else builds URLs.
 */
import type {
  AuthResponse,
  ConnectionRequestView,
  ConnectionView,
  ConversationView,
  DecisionView,
  DeviceSessionView,
  InboxAllResponse,
  InboxResponse,
  MemoryView,
  MessagesPage,
  MessageView,
  MeView,
  NotificationsResponse,
  PeopleSearchResult,
  PersonProfileView,
  PolicyView,
  RelationshipHistoryView,
  RelationshipView,
  SearchResponse,
  SessionResponse,
  SuggestionView,
  TasksResponse,
  TaskView,
  TaxonomyResponse,
} from '@caishy/core/api';
import type { Sphere } from '@caishy/core/taxonomy';
import { api, request } from './client';

type Ok = { ok: true };
const q = (params: Record<string, string | number | boolean | null | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

export interface RelationshipInput {
  sphere: Sphere;
  role?: string | null;
  roleLabel?: string | null;
  orgName?: string | null;
  contextNote?: string | null;
  shared?: boolean;
}

export interface SendBody {
  clientId: string;
  kind?: 'text' | 'media' | 'file' | 'voice' | 'location' | 'contact' | 'poll' | 'kit' | 'sticker';
  body?: string | null;
  payload?: unknown;
  replyToId?: string | null;
  fileIds?: string[];
  urgent?: boolean;
  mentions?: string[];
}

export type TaskViewFilter = 'todo' | 'waiting' | 'asked_me' | 'i_asked' | 'done' | 'all';

export const endpoints = {
  // Account
  signup: (body: {
    email: string;
    password: string;
    displayName: string;
    handle: string;
    birthYear: number;
    timeZone?: string;
    locale?: string;
    client: 'web' | 'native';
    deviceName?: string;
    invite?: string;
  }) => api.post<AuthResponse>('/auth/signup', body),
  login: (body: {
    identifier: string;
    password: string;
    client: 'web' | 'native';
    deviceName?: string;
  }) => api.post<AuthResponse>('/auth/login', body),
  logout: () => api.post<Ok>('/auth/logout'),
  session: () => api.get<SessionResponse>('/auth/session'),
  sessions: () => api.get<{ sessions: DeviceSessionView[] }>('/auth/sessions'),
  revokeSession: (id: string) => api.del<Ok>(`/auth/sessions/${id}`),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<Ok>('/auth/password', { currentPassword, newPassword }),
  newRecoveryCodes: () => api.post<{ recoveryCodes: string[] }>('/auth/recovery-codes'),
  recover: (body: {
    identifier: string;
    code: string;
    newPassword: string;
    client: 'web' | 'native';
  }) => api.post<AuthResponse>('/auth/recover', body),

  me: () => api.get<{ user: MeView }>('/me'),
  deleteAccount: (password: string) => request<Ok>('DELETE', '/me', { body: { password } }),
  updateMe: (patch: Record<string, unknown>) => api.patch<{ user: MeView }>('/me', patch),
  updatePrivacy: (body: Record<string, unknown>) =>
    api.put<{ privacy: MeView['privacy'] }>('/me/privacy', body),
  handleAvailable: (handle: string) =>
    api.get<{ available: boolean; reason: string | null; suggestion: string | null }>(
      `/me/handle-available${q({ handle })}`,
    ),

  // People and relationships
  searchPeople: (term: string) =>
    api.get<{ results: PeopleSearchResult[] }>(`/people/search${q({ q: term })}`),
  person: (id: string) => api.get<PersonProfileView>(`/people/${id}`),
  relationshipHistory: (id: string) =>
    api.get<RelationshipHistoryView>(`/people/${id}/relationships`),
  taxonomy: () => api.get<TaxonomyResponse>('/relationships/taxonomy'),
  addCustomRole: (sphere: Sphere, label: string) =>
    api.post<Ok>('/relationships/custom-roles', { sphere, label }),
  classify: (userId: string, rel: RelationshipInput) =>
    api.post<{ relationship: RelationshipView }>('/relationships', { userId, ...rel }),
  changeRelationship: (id: string, patch: Partial<RelationshipInput>) =>
    api.patch<{ relationship: RelationshipView }>(`/relationships/${id}`, patch),
  endRelationship: (id: string) =>
    api.post<{ relationship: RelationshipView }>(`/relationships/${id}/end`),
  makePrimary: (id: string) => api.post<Ok>(`/relationships/${id}/primary`),

  connections: (params: { sphere?: string; q?: string } = {}) =>
    api.get<{ connections: ConnectionView[] }>(`/connections${q(params)}`),
  requests: (direction: 'incoming' | 'outgoing') =>
    api.get<{ requests: ConnectionRequestView[] }>(`/connections/requests${q({ direction })}`),
  requestConnection: (body: {
    toUserId: string;
    note?: string | null;
    context?: { sphere?: Sphere | null; orgName?: string | null };
    relationship?: RelationshipInput;
  }) =>
    api.post<{ status: string; requestId?: string; conversationId?: string }>(
      '/connections/requests',
      body,
    ),
  acceptRequest: (id: string, relationship?: RelationshipInput) =>
    api.post<{
      status: 'connected';
      connectionId: string;
      conversationId: string;
      relationship: RelationshipView | null;
    }>(`/connections/requests/${id}/accept`, relationship ? { relationship } : {}),
  declineRequest: (id: string) => api.post<Ok>(`/connections/requests/${id}/decline`),
  cancelRequest: (id: string) => api.del<Ok>(`/connections/requests/${id}`),
  updateConnection: (id: string, patch: Record<string, unknown>) =>
    api.patch<Ok>(`/connections/${id}`, patch),
  removeConnection: (id: string) => api.del<Ok>(`/connections/${id}`),

  // Conversations
  inbox: () => api.get<InboxResponse>('/inbox'),
  inboxAll: () => api.get<InboxAllResponse>('/inbox?view=all'),
  conversation: (id: string) => api.get<{ conversation: ConversationView }>(`/conversations/${id}`),
  openDirect: (userId: string, title?: string) =>
    api.post<{ conversation: ConversationView }>('/conversations', {
      kind: 'direct',
      userId,
      title,
    }),
  createGroup: (title: string, memberIds: string[], purpose?: string) =>
    api.post<{ conversation: ConversationView }>('/conversations', {
      kind: 'group',
      title,
      memberIds,
      purpose,
    }),
  updateConversation: (id: string, patch: Record<string, unknown>) =>
    api.patch<{ conversation: ConversationView }>(`/conversations/${id}`, patch),
  answerRequest: (id: string, decision: 'accept' | 'decline') =>
    api.post<Ok>(`/conversations/${id}/request`, { decision }),
  messages: (id: string, params: { before?: number; after?: number; limit?: number } = {}) =>
    api.get<MessagesPage>(`/conversations/${id}/messages${q(params)}`),
  send: (conversationId: string, body: SendBody) =>
    api.post<{ message: MessageView }>(`/conversations/${conversationId}/messages`, body),
  editMessage: (id: string, body: string) =>
    api.patch<{ message: MessageView }>(`/messages/${id}`, { body }),
  deleteMessage: (id: string, forEveryone: boolean) =>
    api.del<Ok>(`/messages/${id}${q({ forEveryone })}`),
  react: (id: string, emoji: string) => api.post<Ok>(`/messages/${id}/reactions`, { emoji }),
  unreact: (id: string, emoji: string) =>
    api.del<Ok>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
  vote: (id: string, optionIds: string[]) =>
    api.post<{ message: MessageView }>(`/messages/${id}/vote`, { optionIds }),
  /** Move a kit card along: approve, accept, mark paid (core kit-cards.ts says who may). */
  moveKit: (id: string, to: string) =>
    api.post<{ message: MessageView }>(`/messages/${id}/kit`, { to }),
  receipts: (id: string, body: { read?: number; delivered?: number }) =>
    api.post<Ok>(`/conversations/${id}/receipts`, body),
  dismissAttention: (id: string) => api.post<Ok>(`/conversations/${id}/dismiss`),
  memory: (id: string) => api.get<MemoryView>(`/conversations/${id}/memory`),

  // Actions and suggestions
  tasks: (view: TaskViewFilter, params: { conversationId?: string; personId?: string } = {}) =>
    api.get<TasksResponse>(`/tasks${q({ view, ...params })}`),
  createTask: (body: {
    title: string;
    notes?: string | null;
    dueAt?: string | null;
    dueHasTime?: boolean;
    assigneeId?: string;
    shared?: boolean;
    conversationId?: string;
    messageId?: string;
    clientId?: string;
  }) => api.post<{ task: TaskView }>('/tasks', body),
  updateTask: (id: string, patch: Record<string, unknown>) =>
    api.patch<{ task: TaskView }>(`/tasks/${id}`, patch),
  deleteTask: (id: string) => api.del<Ok>(`/tasks/${id}`),
  decisions: (params: { conversationId?: string } = {}) =>
    api.get<{ decisions: DecisionView[] }>(`/decisions${q(params)}`),
  suggestions: (params: { conversationId?: string; subjectUserId?: string } = {}) =>
    api.get<{ suggestions: SuggestionView[] }>(`/suggestions${q(params)}`),
  acceptSuggestion: (id: string, body: Record<string, unknown> = {}) =>
    api.post<{ accepted: { type: string; id: string } }>(`/suggestions/${id}/accept`, body),
  dismissSuggestion: (id: string) => api.post<Ok>(`/suggestions/${id}/dismiss`),

  // Search, notifications, policies, safety
  search: (term: string) => api.get<SearchResponse>(`/search${q({ q: term })}`),
  notifications: () => api.get<NotificationsResponse>('/notifications'),
  markNotificationsRead: (body: { ids?: string[]; all?: boolean }) =>
    api.post<Ok>('/notifications/read', body),
  policies: () => api.get<{ policies: PolicyView[] }>('/policies'),
  updatePolicy: (id: string, body: Record<string, unknown>) =>
    api.patch<Ok>(`/policies/${id}`, body),
  resetPolicies: () => api.post<Ok>('/policies/reset'),
  block: (userId: string) => api.post<Ok>('/blocks', { userId }),
  unblock: (userId: string) => api.del<Ok>(`/blocks/${userId}`),
  report: (body: {
    userId?: string;
    messageId?: string;
    conversationId?: string;
    reason: 'spam' | 'scam' | 'harassment' | 'impersonation' | 'inappropriate' | 'other';
    details?: string;
  }) => api.post<Ok>('/reports', body),
};
