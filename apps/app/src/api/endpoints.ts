/**
 * Every call the app makes, typed by the shared contract (@caishy/core/api). Screens call these
 * through TanStack Query; nothing else builds URLs.
 */

import type {
  AiActionsView,
  AiCatchUpView,
  AiRewriteView,
  AiStatusView,
  AiTranslationView,
  AuthResponse,
  BusinessInboxView,
  BusinessSummaryView,
  BusinessThreadView,
  ConnectionRequestView,
  ConnectionView,
  ConversationView,
  DecisionView,
  DeviceSessionView,
  HandleView,
  InboxAllResponse,
  InboxResponse,
  MemoryView,
  MessagesPage,
  MessageView,
  MeView,
  NotificationsResponse,
  OrgAppSecretsView,
  OrgAppView,
  OrgInsightsView,
  OrgSummaryView,
  OrgView,
  PeopleSearchResult,
  PersonProfileView,
  PlanUsageView,
  PolicyView,
  RelationshipHistoryView,
  RelationshipView,
  SearchResponse,
  SessionResponse,
  SpaceSummaryView,
  SpaceView,
  SuggestionView,
  TasksResponse,
  TaskView,
  TaxonomyResponse,
  WebhookDeliveryView,
} from '@caishy/core/api';
import type { ApiScope, WebhookEvent } from '@caishy/core/apps';
import type { RewriteStyle } from '@caishy/core/assist';
import type { BusinessView } from '@caishy/core/business';
import type { ChecklistOp } from '@caishy/core/kit-cards';
import type { OrgKind } from '@caishy/core/orgs';
import type { SpaceKind } from '@caishy/core/spaces';
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
  myPlan: () => api.get<PlanUsageView>('/me/plan'),
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
  checklist: (id: string, op: ChecklistOp) =>
    api.post<{ message: MessageView }>(`/messages/${id}/checklist`, op),
  receipts: (id: string, body: { read?: number; delivered?: number }) =>
    api.post<Ok>(`/conversations/${id}/receipts`, body),
  dismissAttention: (id: string) => api.post<Ok>(`/conversations/${id}/dismiss`),
  memory: (id: string) => api.get<MemoryView>(`/conversations/${id}/memory`),

  // Spaces (PRD §40)
  spaces: () => api.get<{ spaces: SpaceSummaryView[] }>('/spaces'),
  space: (id: string) => api.get<{ space: SpaceView }>(`/spaces/${id}`),
  createSpace: (body: { name: string; kind: SpaceKind; purpose?: string; memberIds: string[] }) =>
    api.post<{ space: SpaceView }>('/spaces', body),
  updateSpace: (id: string, body: { name?: string; kind?: SpaceKind; purpose?: string | null }) =>
    api.patch<{ space: SpaceView }>(`/spaces/${id}`, body),
  addToSpace: (id: string, userIds: string[]) => api.post<Ok>(`/spaces/${id}/members`, { userIds }),
  removeFromSpace: (id: string, userId: string) => api.del<Ok>(`/spaces/${id}/members/${userId}`),
  setSpaceRole: (id: string, userId: string, role: 'admin' | 'member') =>
    api.patch<Ok>(`/spaces/${id}/members/${userId}`, { role }),
  createSpaceConversation: (id: string, body: { title: string; everyone: boolean }) =>
    api.post<{ conversation: ConversationView }>(`/spaces/${id}/conversations`, body),
  joinSpaceConversation: (id: string, conversationId: string) =>
    api.post<{ conversation: ConversationView }>(
      `/spaces/${id}/conversations/${conversationId}/join`,
    ),

  // Organizations (PRD §36)
  orgs: () => api.get<{ orgs: OrgSummaryView[] }>('/orgs'),
  searchOrgs: (term: string) =>
    api.get<{ orgs: OrgSummaryView[] }>(`/orgs/search${q({ q: term })}`),
  /** What an @handle link opens: a person or an organization (one namespace). */
  openHandle: (handle: string) => api.get<HandleView>(`/handles/${encodeURIComponent(handle)}`),
  orgByHandle: (handle: string) =>
    api.get<{ org: OrgView }>(`/orgs/by-handle/${encodeURIComponent(handle)}`),
  createOrg: (body: {
    name: string;
    handle: string;
    kind: OrgKind;
    about?: string;
    website?: string;
  }) => api.post<{ org: OrgView }>('/orgs', body),
  updateOrg: (id: string, body: Record<string, unknown>) =>
    api.patch<{ org: OrgView }>(`/orgs/${id}`, body),
  addToOrg: (id: string, userIds: string[]) => api.post<Ok>(`/orgs/${id}/members`, { userIds }),
  removeFromOrg: (id: string, userId: string) => api.del<Ok>(`/orgs/${id}/members/${userId}`),
  updateOrgMember: (
    id: string,
    userId: string,
    body: { role?: 'admin' | 'agent'; title?: string | null },
  ) => api.patch<Ok>(`/orgs/${id}/members/${userId}`, body),
  setOrgDomain: (id: string, domain: string) =>
    request<{ org: OrgView }>('PUT', `/orgs/${id}/domain`, { body: { domain } }),
  checkOrgDomain: (id: string) => api.post<{ org: OrgView }>(`/orgs/${id}/domain/check`),
  removeOrgDomain: (id: string) => api.del<{ org: OrgView }>(`/orgs/${id}/domain`),

  // Business inbox (PRD §38): a customer's one conversation with an organization, as its team works it
  messageOrg: (orgId: string) =>
    api.post<{ conversationId: string; created: boolean }>(`/orgs/${orgId}/conversations`),
  orgInbox: (orgId: string, view: BusinessView) =>
    api.get<BusinessInboxView>(`/orgs/${orgId}/inbox${q({ view })}`),
  businessSummary: () => api.get<BusinessSummaryView>('/business/summary'),
  assignThread: (conversationId: string, userId: string | null) =>
    api.post<{ thread: BusinessThreadView }>(`/business/${conversationId}/assign`, { userId }),
  resolveThread: (conversationId: string) =>
    api.post<{ thread: BusinessThreadView }>(`/business/${conversationId}/resolve`),
  reopenThread: (conversationId: string) =>
    api.post<{ thread: BusinessThreadView }>(`/business/${conversationId}/reopen`),
  escalateThread: (conversationId: string, note?: string) =>
    api.post<{ thread: BusinessThreadView }>(
      `/business/${conversationId}/escalate`,
      note ? { note } : {},
    ),
  deescalateThread: (conversationId: string) =>
    api.del<{ thread: BusinessThreadView }>(`/business/${conversationId}/escalation`),

  // Apps (PRD §73–75): an organization's integrations, managed by its owner and admins
  orgApps: (orgId: string) => api.get<{ apps: OrgAppView[] }>(`/orgs/${orgId}/apps`),
  orgInsights: (orgId: string, days: 7 | 30) =>
    api.get<{ insights: OrgInsightsView }>(`/orgs/${orgId}/insights?days=${days}`),
  createOrgApp: (
    orgId: string,
    body: { name: string; scopes: ApiScope[]; webhookUrl?: string | null; events: WebhookEvent[] },
  ) => api.post<OrgAppSecretsView>(`/orgs/${orgId}/apps`, body),
  updateOrgApp: (
    orgId: string,
    appId: string,
    body: Partial<{
      name: string;
      scopes: ApiScope[];
      webhookUrl: string | null;
      events: WebhookEvent[];
    }>,
  ) => api.patch<{ app: OrgAppView }>(`/orgs/${orgId}/apps/${appId}`, body),
  replaceAppToken: (orgId: string, appId: string) =>
    api.post<OrgAppSecretsView>(`/orgs/${orgId}/apps/${appId}/token`),
  replaceAppSecret: (orgId: string, appId: string) =>
    api.post<OrgAppSecretsView>(`/orgs/${orgId}/apps/${appId}/secret`),
  pingApp: (orgId: string, appId: string) =>
    api.post<{ deliveryId: string }>(`/orgs/${orgId}/apps/${appId}/ping`),
  appDeliveries: (orgId: string, appId: string) =>
    api.get<{ deliveries: WebhookDeliveryView[] }>(`/orgs/${orgId}/apps/${appId}/deliveries`),
  removeOrgApp: (orgId: string, appId: string) => api.del<Ok>(`/orgs/${orgId}/apps/${appId}`),

  // AI assist: every answer is a suggestion, used only when the person taps it (R17)
  ai: () => api.get<AiStatusView>('/ai'),
  aiRewrite: (body: { text: string; style: RewriteStyle; conversationId: string }) =>
    api.post<AiRewriteView>('/ai/rewrite', body),
  aiTranslate: (messageId: string) => api.post<AiTranslationView>('/ai/translate', { messageId }),
  catchUp: (id: string) => api.post<AiCatchUpView>(`/conversations/${id}/catch-up`, {}),
  findActions: (id: string) => api.post<AiActionsView>(`/conversations/${id}/ai/actions`, {}),

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
  blockOrg: (orgId: string) => api.post<Ok>(`/orgs/${orgId}/block`),
  unblockOrg: (orgId: string) => api.del<Ok>(`/orgs/${orgId}/block`),
  report: (body: {
    userId?: string;
    messageId?: string;
    conversationId?: string;
    reason: 'spam' | 'scam' | 'harassment' | 'impersonation' | 'inappropriate' | 'other';
    details?: string;
  }) => api.post<Ok>('/reports', body),
};
