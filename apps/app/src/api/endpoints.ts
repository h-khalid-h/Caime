/**
 * Every call the app makes, typed by the shared contract (@caime/core/api). Screens call these
 * through TanStack Query; nothing else builds URLs.
 */

import type {
  AboutView,
  AgentTryView,
  AiActionsView,
  AiCatchUpView,
  AiRewriteView,
  AiStatusView,
  AiTranslationView,
  AlbumResponse,
  AssetsResponse,
  AssetView,
  AuthResponse,
  AutomationsResponse,
  BookingResponse,
  BriefView,
  BusinessInboxView,
  BusinessSummaryView,
  CalendarFeedCreatedResponse,
  CalendarFeedResponse,
  CalendarView,
  CallHistoryResponse,
  CallResponse,
  CheckoutSettledResponse,
  CollectionRenamedResponse,
  ConnectedAppsResponse,
  ConnectionRequestsResponse,
  ConnectionsResponse,
  ConnectResponse,
  ConversationDevicesView,
  ConversationIdResponse,
  ConversationResponse,
  CountriesView,
  CurrenciesView,
  CustomKitsResponse,
  DecisionsResponse,
  DeliveriesResponse,
  DeliveryQueuedResponse,
  DeviceRemovedResponse,
  DeviceResponse,
  EffectivePolicyResponse,
  ErasedResponse,
  FollowingResponse,
  FollowResponse,
  GroupCallMaybeResponse,
  GroupCallResponse,
  HandleAvailabilityResponse,
  HandleView,
  IceConfigView,
  IdResponse,
  ImportChatView,
  InboxAllResponse,
  InboxResponse,
  InviteAcceptView,
  InviteOpenResponse,
  InviteResponse,
  InvitesResponse,
  LiveCallsResponse,
  MemoryView,
  MessageIdsResponse,
  MessageResponse,
  MessagesPage,
  MessagesResponse,
  MyDevicesResponse,
  NotificationsResponse,
  OAuthAppCreatedResponse,
  OAuthAppsResponse,
  OAuthConsentView,
  OAuthRedirectResponse,
  OkResponse,
  OrgAgentResponse,
  OrgAgentSetResponse,
  OrgAppResponse,
  OrgAppSecretsView,
  OrgAppsResponse,
  OrgCalendarView,
  OrgCheckoutResponse,
  OrgConversationResponse,
  OrgDoorView,
  OrgExportView,
  OrgInsightsResponse,
  OrgReclaimView,
  OrgResponse,
  OrgSpacesResponse,
  OrgsResponse,
  OrgUpdateResponse,
  OrgUpdatesView,
  PeopleSearchResponse,
  PersonalTokenCreatedResponse,
  PersonalTokensResponse,
  PersonInsightsResponse,
  PersonProfileView,
  PlanUsageView,
  PoliciesResponse,
  PolicyCreatedResponse,
  PrivacyResponse,
  PushKeyResponse,
  RecoveryCodesResponse,
  RelationshipHistoryView,
  RelationshipResponse,
  RequestAcceptedResponse,
  SavedCollectionsResponse,
  SavedItemsResponse,
  SavedResponse,
  SearchResponse,
  SessionResponse,
  SessionsResponse,
  SlotsView,
  SpaceResponse,
  SpacesResponse,
  StartThreadResult,
  SuggestionAcceptedResponse,
  SuggestionsAcceptedView,
  SuggestionsResponse,
  TaskResponse,
  TasksResponse,
  TaxonomyResponse,
  ThreadResponse,
  TimeZonesView,
  UrlResponse,
  UserResponse,
} from '@caime/core/api';
import type { ApiScope, WebhookEvent } from '@caime/core/apps';
import type { RewriteStyle } from '@caime/core/assist';
import type { AutomationWhen } from '@caime/core/automations';
import type { BilledPlan, BillingInterval, BillingView } from '@caime/core/billing';

/** Whose slots: an organization's or a person's (R58). */
export interface BookingHostRef {
  kind: 'org' | 'person';
  id: string;
}

import type { BusinessView } from '@caime/core/business';
import type { CallKind } from '@caime/core/calls';
import type { PublicJwk, SealedMessage } from '@caime/core/e2ee';
import type { ChecklistOp, SplitOp } from '@caime/core/kit-cards';
import type { OrgKind } from '@caime/core/orgs';
import type { SpaceKind } from '@caime/core/spaces';
import type { Sphere } from '@caime/core/taxonomy';
import { api, request } from './client';

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
  /** In a private conversation: the message, sealed on this device (R18). */
  sealed?: SealedMessage;
}

export type TaskViewFilter = 'todo' | 'waiting' | 'asked_me' | 'i_asked' | 'done' | 'all';

export const endpoints = {
  // Account
  signup: (body: {
    email: string;
    password: string;
    displayName: string;
    handle: string;
    /** YYYY-MM-DD. */
    birthDate: string;
    /** Where they live (ISO 3166-1). */
    country: string;
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
  logout: () => api.post<OkResponse>('/auth/logout'),
  session: () => api.get<SessionResponse>('/auth/session'),
  sessions: () => api.get<SessionsResponse>('/auth/sessions'),
  revokeSession: (id: string) => api.del<OkResponse>(`/auth/sessions/${id}`),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<OkResponse>('/auth/password', { currentPassword, newPassword }),
  /** New recovery codes in place of the old, once the password says it's them. */
  newRecoveryCodes: (password: string) =>
    api.post<RecoveryCodesResponse>('/auth/recovery-codes', { password }),
  /** A forgotten password (R48): a link to the address, the same answer either way. */
  requestReset: (email: string) => api.post<OkResponse>('/auth/reset', { email }),
  confirmReset: (body: { token: string; newPassword: string; client: 'web' | 'native' }) =>
    api.post<AuthResponse>('/auth/reset/confirm', body),
  /** The code that confirms an address, and another one when the first didn't come. */
  verifyEmail: (code: string) => api.post<UserResponse>('/auth/email/verify', { code }),
  resendEmailCode: () => api.post<OkResponse>('/auth/email/send'),
  recover: (body: {
    identifier: string;
    code: string;
    newPassword: string;
    client: 'web' | 'native';
  }) => api.post<AuthResponse>('/auth/recover', body),

  me: () => api.get<UserResponse>('/me'),
  myPlan: () => api.get<PlanUsageView>('/me/plan'),
  /** How your relationships are going (R47, Pro), for you only. */
  myInsights: (days: 30 | 90 | 365) => api.get<PersonInsightsResponse>(`/me/insights?days=${days}`),
  billing: () => api.get<BillingView>('/billing'),
  orgBilling: (orgId: string) => api.get<BillingView>(`/orgs/${orgId}/billing`),
  checkout: (body: { plan: BilledPlan; interval: BillingInterval; orgId?: string }) =>
    api.post<UrlResponse>('/billing/checkout', body),
  billingPortal: (orgId?: string) =>
    api.post<UrlResponse>('/billing/portal', orgId ? { orgId } : {}),
  deleteAccount: (password: string) => request<OkResponse>('DELETE', '/me', { body: { password } }),
  updateMe: (patch: Record<string, unknown>) => api.patch<UserResponse>('/me', patch),
  updatePrivacy: (body: Record<string, unknown>) => api.put<PrivacyResponse>('/me/privacy', body),
  /** Every country named in `locale`'s language, and the one the device suggests (lib/geo.ts). */
  countries: (locale: string, timeZone?: string) =>
    api.get<CountriesView>(`/countries${q({ locale, timeZone })}`),
  /** Every time zone, its city, country and offset now, and the device's by its current name. */
  timeZones: (locale: string, timeZone?: string) =>
    api.get<TimeZonesView>(`/time-zones${q({ locale, timeZone })}`),
  /** Every currency a country uses, named in `locale`'s language. */
  currencies: (locale: string) => api.get<CurrenciesView>(`/currencies${q({ locale })}`),
  handleAvailable: (handle: string) =>
    api.get<HandleAvailabilityResponse>(`/me/handle-available${q({ handle })}`),

  // People and relationships
  searchPeople: (term: string) => api.get<PeopleSearchResponse>(`/people/search${q({ q: term })}`),
  person: (id: string) => api.get<PersonProfileView>(`/people/${id}`),
  relationshipHistory: (id: string) =>
    api.get<RelationshipHistoryView>(`/people/${id}/relationships`),
  taxonomy: () => api.get<TaxonomyResponse>('/relationships/taxonomy'),
  addCustomRole: (sphere: Sphere, label: string) =>
    api.post<OkResponse>('/relationships/custom-roles', { sphere, label }),
  classify: (userId: string, rel: RelationshipInput) =>
    api.post<RelationshipResponse>('/relationships', { userId, ...rel }),
  changeRelationship: (id: string, patch: Partial<RelationshipInput>) =>
    api.patch<RelationshipResponse>(`/relationships/${id}`, patch),
  endRelationship: (id: string) => api.post<RelationshipResponse>(`/relationships/${id}/end`),
  makePrimary: (id: string) => api.post<OkResponse>(`/relationships/${id}/primary`),

  connections: (params: { sphere?: string; q?: string } = {}) =>
    api.get<ConnectionsResponse>(`/connections${q(params)}`),
  requests: (direction: 'incoming' | 'outgoing') =>
    api.get<ConnectionRequestsResponse>(`/connections/requests${q({ direction })}`),
  requestConnection: (body: {
    toUserId: string;
    note?: string | null;
    context?: { sphere?: Sphere | null; orgName?: string | null };
    relationship?: RelationshipInput;
  }) => api.post<ConnectResponse>('/connections/requests', body),
  acceptRequest: (id: string, relationship?: RelationshipInput) =>
    api.post<RequestAcceptedResponse>(
      `/connections/requests/${id}/accept`,
      relationship ? { relationship } : {},
    ),
  declineRequest: (id: string) => api.post<OkResponse>(`/connections/requests/${id}/decline`),
  /** Invite links (R1): mine, a new one, one taken back, one opened and one joined through. */
  invites: () => api.get<InvitesResponse>('/invites'),
  makeInvite: (body: {
    relationship?: RelationshipInput;
    showContext?: boolean;
    note?: string | null;
  }) => api.post<InviteResponse>('/invites', body),
  revokeInvite: (id: string) => api.del<OkResponse>(`/invites/${id}`),
  openInvite: (token: string) =>
    api.get<InviteOpenResponse>(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    api.post<InviteAcceptView>(`/invites/${encodeURIComponent(token)}/accept`),
  cancelRequest: (id: string) => api.del<OkResponse>(`/connections/requests/${id}`),
  updateConnection: (id: string, patch: Record<string, unknown>) =>
    api.patch<OkResponse>(`/connections/${id}`, patch),
  removeConnection: (id: string) => api.del<OkResponse>(`/connections/${id}`),
  /** Not the same person after all (PRD §51): a merged account stands on its own again. */
  separateConnection: (id: string) => api.post<OkResponse>(`/connections/${id}/separate`),

  // Conversations
  inbox: () => api.get<InboxResponse>('/inbox'),
  inboxAll: () => api.get<InboxAllResponse>('/inbox?view=all'),
  conversation: (id: string) => api.get<ConversationResponse>(`/conversations/${id}`),
  openDirect: (userId: string, title?: string, opts: { private?: boolean } = {}) =>
    api.post<ConversationResponse>('/conversations', {
      kind: 'direct',
      userId,
      title,
      ...(opts.private ? { private: true } : {}),
    }),
  createGroup: (
    title: string,
    memberIds: string[],
    purpose?: string,
    opts: { private?: boolean } = {},
  ) =>
    api.post<ConversationResponse>('/conversations', {
      kind: 'group',
      title,
      memberIds,
      purpose,
      ...(opts.private ? { private: true } : {}),
    }),
  updateConversation: (id: string, patch: Record<string, unknown>) =>
    api.patch<ConversationResponse>(`/conversations/${id}`, patch),
  // Running a group (PRD §56): who's in it, and who runs it.
  addToGroup: (id: string, userIds: string[]) =>
    api.post<OkResponse>(`/conversations/${id}/members`, { userIds }),
  removeFromGroup: (id: string, userId: string) =>
    api.del<OkResponse>(`/conversations/${id}/members/${userId}`),
  setGroupRole: (id: string, userId: string, role: 'admin' | 'member') =>
    api.patch<OkResponse>(`/conversations/${id}/members/${userId}`, { role }),
  answerRequest: (id: string, decision: 'accept' | 'decline') =>
    api.post<OkResponse>(`/conversations/${id}/request`, { decision }),
  messages: (id: string, params: { before?: number; after?: number; limit?: number } = {}) =>
    api.get<MessagesPage>(`/conversations/${id}/messages${q(params)}`),
  send: (conversationId: string, body: SendBody) =>
    api.post<MessageResponse>(`/conversations/${conversationId}/messages`, body),
  /** A topic of a one-to-one or a group (PRD §58): the conversation it is. */
  /** A chat brought over from WhatsApp (R45): lands as a topic with that person. */
  importChat: (body: {
    userId: string;
    source: 'whatsapp';
    title?: string;
    messages: Array<{ at: string; mine: boolean; text: string }>;
  }) => api.post<ImportChatView>('/conversations/import', body),
  startTopic: (conversationId: string, title: string) =>
    api.post<ConversationIdResponse>(`/conversations/${conversationId}/topics`, { title }),
  /** A new text, and who it mentions (in a group), or a private message sealed again. */
  editMessage: (id: string, body: string | { sealed: SealedMessage }, mentions?: string[]) =>
    api.patch<MessageResponse>(
      `/messages/${id}`,
      typeof body === 'string' ? { body, ...(mentions ? { mentions } : {}) } : body,
    ),
  deleteMessage: (id: string, forEveryone: boolean) =>
    api.del<OkResponse>(`/messages/${id}${q({ forEveryone })}`),
  forward: (id: string, conversationIds: string[], clientId: string) =>
    api.post<MessageIdsResponse>(`/messages/${id}/forward`, { conversationIds, clientId }),
  react: (id: string, emoji: string) =>
    api.post<OkResponse>(`/messages/${id}/reactions`, { emoji }),
  unreact: (id: string, emoji: string) =>
    api.del<OkResponse>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
  vote: (id: string, optionIds: string[]) =>
    api.post<MessageResponse>(`/messages/${id}/vote`, { optionIds }),
  /** Move a kit card along: approve, accept, mark paid (core kit-cards.ts says who may). */
  /** Where this Caime keeps its policies and help, as its operator set them. */
  about: () => api.get<AboutView>('/about'),
  moveKit: (id: string, to: string) => api.post<MessageResponse>(`/messages/${id}/kit`, { to }),
  /** The organization's own kinds of card its team may send here (PRD §74). */
  customKits: (conversationId: string) =>
    api.get<CustomKitsResponse>(`/conversations/${conversationId}/kits`),
  checklist: (id: string, op: ChecklistOp) =>
    api.post<MessageResponse>(`/messages/${id}/checklist`, op),
  split: (id: string, op: SplitOp) => api.post<MessageResponse>(`/messages/${id}/split`, op),
  album: (id: string) => api.get<AlbumResponse>(`/messages/${id}/album`),
  addToAlbum: (id: string, fileIds: string[]) =>
    api.post<MessageResponse>(`/messages/${id}/album`, { fileIds }),
  removeFromAlbum: (id: string, fileId: string) =>
    api.del<MessageResponse>(`/messages/${id}/album/${fileId}`),
  receipts: (id: string, body: { read?: number; delivered?: number }) =>
    api.post<OkResponse>(`/conversations/${id}/receipts`, body),
  dismissAttention: (id: string) => api.post<OkResponse>(`/conversations/${id}/dismiss`),
  memory: (id: string) => api.get<MemoryView>(`/conversations/${id}/memory`),

  // Spaces (PRD §40)
  spaces: () => api.get<SpacesResponse>('/spaces'),
  space: (id: string) => api.get<SpaceResponse>(`/spaces/${id}`),
  createSpace: (body: {
    name: string;
    kind: SpaceKind;
    purpose?: string;
    memberIds: string[];
    /** An organization's space (R43), started by its owner or an admin. */
    orgId?: string;
  }) => api.post<SpaceResponse>('/spaces', body),
  updateSpace: (id: string, body: { name?: string; kind?: SpaceKind; purpose?: string | null }) =>
    api.patch<SpaceResponse>(`/spaces/${id}`, body),
  addToSpace: (id: string, userIds: string[]) =>
    api.post<OkResponse>(`/spaces/${id}/members`, { userIds }),
  removeFromSpace: (id: string, userId: string) =>
    api.del<OkResponse>(`/spaces/${id}/members/${userId}`),
  setSpaceRole: (id: string, userId: string, role: 'admin' | 'member') =>
    api.patch<OkResponse>(`/spaces/${id}/members/${userId}`, { role }),
  createSpaceConversation: (id: string, body: { title: string; everyone: boolean }) =>
    api.post<ConversationResponse>(`/spaces/${id}/conversations`, body),
  joinSpaceConversation: (id: string, conversationId: string) =>
    api.post<ConversationResponse>(`/spaces/${id}/conversations/${conversationId}/join`),

  // Organizations (PRD §36)
  orgs: () => api.get<OrgsResponse>('/orgs'),
  searchOrgs: (term: string) => api.get<OrgsResponse>(`/orgs/search${q({ q: term })}`),
  /** What an @handle link opens: a person or an organization (one namespace). */
  openHandle: (handle: string) => api.get<HandleView>(`/handles/${encodeURIComponent(handle)}`),
  /** The organization's spaces (R43): yours, and running it, all of them. */
  orgSpaces: (id: string) => api.get<OrgSpacesResponse>(`/orgs/${id}/spaces`),
  orgDoor: (id: string) => api.get<OrgDoorView>(`/orgs/${id}/door`),
  /** The organization's own conversations (R54): its owner's or admins' to take. */
  orgExport: (id: string) => api.get<OrgExportView>(`/orgs/${id}/export`),
  /** Erase a customer's conversation at their request (R54): every message in it goes. */
  eraseThread: (orgId: string, conversationId: string) =>
    api.del<ErasedResponse>(`/orgs/${orgId}/conversations/${conversationId}`),
  joinOrgSpace: (id: string, spaceId: string) =>
    api.post<OkResponse>(`/orgs/${id}/spaces/${spaceId}/join`),
  orgByHandle: (handle: string) =>
    api.get<OrgResponse>(`/orgs/by-handle/${encodeURIComponent(handle)}`),
  createOrg: (body: {
    name: string;
    handle: string;
    kind: OrgKind;
    /** Where it's based (ISO 3166-1). */
    country: string;
    foundedYear?: number | null;
    about?: string;
    website?: string;
  }) => api.post<OrgResponse>('/orgs', body),
  updateOrg: (id: string, body: Record<string, unknown>) =>
    api.patch<OrgResponse>(`/orgs/${id}`, body),
  addToOrg: (id: string, userIds: string[]) =>
    api.post<OkResponse>(`/orgs/${id}/members`, { userIds }),
  removeFromOrg: (id: string, userId: string) =>
    api.del<OkResponse>(`/orgs/${id}/members/${userId}`),
  updateOrgMember: (
    id: string,
    userId: string,
    body: { role?: 'admin' | 'agent'; title?: string | null },
  ) => api.patch<OkResponse>(`/orgs/${id}/members/${userId}`, body),
  setOrgDomain: (id: string, domain: string) =>
    request<OrgResponse>('PUT', `/orgs/${id}/domain`, { body: { domain } }),
  checkOrgDomain: (id: string) => api.post<OrgResponse>(`/orgs/${id}/domain/check`),
  removeOrgDomain: (id: string) => api.del<OrgResponse>(`/orgs/${id}/domain`),
  /** Its owner closes it (R42). */
  closeOrg: (id: string) => api.post<OkResponse>(`/orgs/${id}/close`),
  /** Taking a closed organization back (R42): the record to add at its domain, then check. */
  reclaimOrg: (id: string) => api.post<OrgReclaimView>(`/orgs/${id}/reclaim`),
  checkReclaim: (id: string) => api.post<OrgResponse>(`/orgs/${id}/reclaim/check`),

  // Business inbox (PRD §38): a customer's one conversation with an organization, as its team works it
  messageOrg: (orgId: string, asOrgId: string | null = null) =>
    api.post<OrgConversationResponse>(
      `/orgs/${orgId}/conversations`,
      asOrgId ? { asOrgId } : undefined,
    ),
  // An organization's own checkout (R65): connected by its owner, paid into by card
  orgCheckout: (orgId: string) => api.get<OrgCheckoutResponse>(`/orgs/${orgId}/checkout`),
  connectCheckout: (orgId: string) => api.post<UrlResponse>(`/orgs/${orgId}/checkout/connect`),
  refreshCheckout: (orgId: string) =>
    api.post<OrgCheckoutResponse>(`/orgs/${orgId}/checkout/refresh`),
  disconnectCheckout: (orgId: string) => api.del<OkResponse>(`/orgs/${orgId}/checkout`),
  payByCard: (messageId: string) => api.post<UrlResponse>(`/messages/${messageId}/checkout`),
  checkCheckout: (messageId: string) =>
    api.post<CheckoutSettledResponse>(`/messages/${messageId}/checkout/check`),
  // Personal access tokens (PRD §74): made and revoked only while signed in
  tokens: () => api.get<PersonalTokensResponse>('/me/tokens'),
  createToken: (body: { name: string; scopes: string[]; days: 30 | 90 | 365 | null }) =>
    api.post<PersonalTokenCreatedResponse>('/me/tokens', body),
  revokeToken: (id: string) => api.del<OkResponse>(`/me/tokens/${id}`),
  // OAuth (PRD §74): apps a developer registers, and apps someone lets act for them
  oauthApps: () => api.get<OAuthAppsResponse>('/me/oauth-apps'),
  createOAuthApp: (body: {
    name: string;
    website?: string;
    redirectUris: string[];
    confidential: boolean;
  }) => api.post<OAuthAppCreatedResponse>('/me/oauth-apps', body),
  removeOAuthApp: (id: string) => api.del<OkResponse>(`/me/oauth-apps/${id}`),
  oauthConsent: (params: Record<string, string>) =>
    api.get<OAuthConsentView>(`/oauth/authorize?${new URLSearchParams(params).toString()}`),
  oauthDecide: (params: Record<string, string>, decision: 'allow' | 'deny') =>
    api.post<OAuthRedirectResponse>('/oauth/authorize', { ...params, decision }),
  connectedApps: () => api.get<ConnectedAppsResponse>('/me/connected-apps'),
  removeConnectedApp: (grantId: string) => api.del<OkResponse>(`/me/connected-apps/${grantId}`),
  // Calls (PRD §47): the server rings and relays; the media goes device to device
  callIce: () => api.get<IceConfigView>('/calls/ice'),
  liveCall: () => api.get<LiveCallsResponse>('/calls/live'),
  startCall: (conversationId: string, body: { kind: CallKind; deviceId: string }) =>
    api.post<CallResponse>(`/conversations/${conversationId}/calls`, body),
  acceptCall: (id: string, deviceId: string) =>
    api.post<CallResponse>(`/calls/${id}/accept`, { deviceId }),
  declineCall: (id: string) => api.post<CallResponse>(`/calls/${id}/decline`, {}),
  endCall: (id: string, body: { deviceId: string; failed?: boolean }) =>
    api.post<CallResponse>(`/calls/${id}/end`, body),
  signalCall: (
    id: string,
    body: {
      deviceId: string;
      kind: 'offer' | 'answer' | 'candidate';
      sdp?: string;
      candidate?: RTCIceCandidateInit;
    },
  ) => api.post<OkResponse>(`/calls/${id}/signal`, body),
  callAlive: (id: string, deviceId: string) =>
    api.post<CallResponse>(`/calls/${id}/alive`, { deviceId }),
  // Private conversations (R18): this device's public keys, and everyone's to seal for
  registerDevice: (body: {
    id: string;
    encryptionKey: PublicJwk;
    signingKey: PublicJwk;
    introduction: string;
    name?: string;
    startOver?: boolean;
    resume?: boolean;
  }) => api.post<DeviceResponse>('/e2ee/devices', body),
  registerRecovery: (body: {
    id: string;
    encryptionKey: PublicJwk;
    signingKey: PublicJwk;
    introduction: string;
  }) => api.post<DeviceResponse>('/e2ee/recovery', body),
  restoreDevice: (id: string, body: { introduction: string }) =>
    api.post<DeviceResponse>(`/e2ee/devices/${id}/restore`, body),
  myDevices: () => api.get<MyDevicesResponse>('/e2ee/devices'),
  approveDevice: (id: string, body: { introduction: string }) =>
    api.post<DeviceResponse>(`/e2ee/devices/${id}/approve`, body),
  removeDevice: (id: string) => api.del<DeviceRemovedResponse>(`/e2ee/devices/${id}`),
  conversationDevices: (conversationId: string, ids: string[] = []) =>
    api.get<ConversationDevicesView>(
      `/conversations/${conversationId}/devices${q({ ids: ids.length ? ids.join(',') : undefined })}`,
    ),
  callHistory: (params: { before?: string; limit?: number; with?: string; missed?: boolean }) =>
    api.get<CallHistoryResponse>(
      `/calls/history${q({ ...params, missed: params.missed ? '1' : undefined })}`,
    ),
  // Group calls: every device in one connects to every other
  liveGroupCall: () => api.get<GroupCallMaybeResponse>('/group-calls/live'),
  groupCallIn: (conversationId: string) =>
    api.get<GroupCallMaybeResponse>(`/conversations/${conversationId}/group-call`),
  startGroupCall: (conversationId: string, body: { kind: CallKind; deviceId: string }) =>
    api.post<GroupCallResponse>(`/conversations/${conversationId}/group-calls`, body),
  joinGroupCall: (id: string, deviceId: string) =>
    api.post<GroupCallResponse>(`/group-calls/${id}/join`, { deviceId }),
  declineGroupCall: (id: string) => api.post<GroupCallResponse>(`/group-calls/${id}/decline`, {}),
  leaveGroupCall: (id: string, deviceId: string) =>
    api.post<GroupCallResponse>(`/group-calls/${id}/leave`, { deviceId }),
  signalGroupCall: (
    id: string,
    body: {
      deviceId: string;
      to: string;
      toUser: string;
      kind: 'offer' | 'answer' | 'candidate';
      sdp?: string;
      candidate?: RTCIceCandidateInit;
    },
  ) => api.post<OkResponse>(`/group-calls/${id}/signal`, body),
  groupCallAlive: (id: string, deviceId: string) =>
    api.post<GroupCallResponse>(`/group-calls/${id}/alive`, { deviceId }),
  // Live location (R29): the sharer's device moves it; only they stop it
  moveLocation: (messageId: string, point: { lat: number; lng: number; accuracy?: number }) =>
    api.post<MessageResponse>(`/messages/${messageId}/location`, point),
  stopLocation: (messageId: string) =>
    api.post<MessageResponse>(`/messages/${messageId}/location/stop`),
  /** Someone on the team writes to a person first: a message request to them (R14). */
  startThread: (orgId: string, body: { handle: string; body: string; clientId: string }) =>
    api.post<StartThreadResult>(`/orgs/${orgId}/threads`, body),
  orgInbox: (orgId: string, view: BusinessView) =>
    api.get<BusinessInboxView>(`/orgs/${orgId}/inbox${q({ view })}`),
  businessSummary: () => api.get<BusinessSummaryView>('/business/summary'),
  assignThread: (conversationId: string, userId: string | null) =>
    api.post<ThreadResponse>(`/business/${conversationId}/assign`, { userId }),
  resolveThread: (conversationId: string) =>
    api.post<ThreadResponse>(`/business/${conversationId}/resolve`),
  reopenThread: (conversationId: string) =>
    api.post<ThreadResponse>(`/business/${conversationId}/reopen`),
  escalateThread: (conversationId: string, note?: string) =>
    api.post<ThreadResponse>(`/business/${conversationId}/escalate`, note ? { note } : {}),
  deescalateThread: (conversationId: string) =>
    api.del<ThreadResponse>(`/business/${conversationId}/escalation`),

  // Apps (PRD §73–75): an organization's integrations, managed by its owner and admins
  // An organization's AI agent (PRD §74–75), for its owner and admins
  orgAgent: (orgId: string) => api.get<OrgAgentResponse>(`/orgs/${orgId}/agent`),
  setOrgAgent: (orgId: string, body: { name: string; knowledge: string; paused: boolean }) =>
    api.put<OrgAgentSetResponse>(`/orgs/${orgId}/agent`, body),
  removeOrgAgent: (orgId: string) => api.del<OkResponse>(`/orgs/${orgId}/agent`),
  tryOrgAgent: (orgId: string, body: { name: string; knowledge: string; question: string }) =>
    api.post<AgentTryView>(`/orgs/${orgId}/agent/try`, body),
  orgApps: (orgId: string) => api.get<OrgAppsResponse>(`/orgs/${orgId}/apps`),
  orgInsights: (orgId: string, days: 7 | 30) =>
    api.get<OrgInsightsResponse>(`/orgs/${orgId}/insights?days=${days}`),
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
  ) => api.patch<OrgAppResponse>(`/orgs/${orgId}/apps/${appId}`, body),
  replaceAppToken: (orgId: string, appId: string) =>
    api.post<OrgAppSecretsView>(`/orgs/${orgId}/apps/${appId}/token`),
  replaceAppSecret: (orgId: string, appId: string) =>
    api.post<OrgAppSecretsView>(`/orgs/${orgId}/apps/${appId}/secret`),
  pingApp: (orgId: string, appId: string) =>
    api.post<DeliveryQueuedResponse>(`/orgs/${orgId}/apps/${appId}/ping`),
  appDeliveries: (orgId: string, appId: string) =>
    api.get<DeliveriesResponse>(`/orgs/${orgId}/apps/${appId}/deliveries`),
  removeOrgApp: (orgId: string, appId: string) =>
    api.del<OkResponse>(`/orgs/${orgId}/apps/${appId}`),

  // AI assist: every answer is a suggestion, used only when the person taps it (R17)
  ai: () => api.get<AiStatusView>('/ai'),
  aiRewrite: (body: { text: string; style: RewriteStyle; conversationId: string }) =>
    api.post<AiRewriteView>('/ai/rewrite', body),
  aiTranslate: (messageId: string) => api.post<AiTranslationView>('/ai/translate', { messageId }),
  catchUp: (id: string) => api.post<AiCatchUpView>(`/conversations/${id}/catch-up`, {}),
  findActions: (id: string) => api.post<AiActionsView>(`/conversations/${id}/ai/actions`, {}),

  // The calendar (R51)
  calendar: (from: string, to: string) => api.get<CalendarView>(`/calendar${q({ from, to })}`),
  orgCalendar: (orgId: string, from: string, to: string) =>
    api.get<OrgCalendarView>(`/orgs/${orgId}/calendar${q({ from, to })}`),

  /** What a host offers (R58, R60, R61), saved whole: its hours, catalog, orders, collections. */
  setOrgBooking: (orgId: string, offer: BookingResponse) =>
    api.put<BookingResponse>(`/orgs/${orgId}/booking`, offer),
  // Bookings for people too (R58): my hours and catalog, and anyone's open slots.
  myBooking: () => api.get<BookingResponse>('/me/booking'),
  setMyBooking: (offer: BookingResponse) => api.put<BookingResponse>('/me/booking', offer),
  slots: (host: BookingHostRef, from: string, to: string, item?: string, quantity?: number) =>
    api.get<SlotsView>(
      `/${host.kind === 'org' ? 'orgs' : 'people'}/${host.id}/slots${q({ from, to, item, quantity })}`,
    ),
  /** Who on the team does a booking (R58); null takes the name off. */
  setBookingProvider: (messageId: string, userId: string | null) =>
    api.post<MessageResponse>(`/messages/${messageId}/booking/provider`, { userId }),
  /** The brief before a meeting or an appointment (R58). */
  brief: (messageId: string) => api.get<BriefView>(`/messages/${messageId}/brief`),

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
  }) => api.post<TaskResponse>('/tasks', body),
  updateTask: (id: string, patch: Record<string, unknown>) =>
    api.patch<TaskResponse>(`/tasks/${id}`, patch),
  deleteTask: (id: string) => api.del<OkResponse>(`/tasks/${id}`),
  calendarFeed: () => api.get<CalendarFeedResponse>('/calendar/feed'),
  /** A new address, shown this once; any old one stops working. */
  newCalendarFeed: () => api.post<CalendarFeedCreatedResponse>('/calendar/feed', {}),
  stopCalendarFeed: () => api.del<OkResponse>('/calendar/feed'),
  decisions: (params: { conversationId?: string } = {}) =>
    api.get<DecisionsResponse>(`/decisions${q(params)}`),
  createDecision: (body: { conversationId: string; title: string; messageId?: string }) =>
    api.post<IdResponse>('/decisions', body),
  /** What's been shared in a conversation, of these kinds: newest first, a page at a time. */
  assets: (conversationId: string, kinds: readonly AssetView['kind'][], before?: string) =>
    api.get<AssetsResponse>(
      `/conversations/${conversationId}/assets${q({ kind: kinds.join(','), before })}`,
    ),
  pins: (conversationId: string) =>
    api.get<MessagesResponse>(`/conversations/${conversationId}/pins`),
  pin: (messageId: string) => api.post<OkResponse>(`/messages/${messageId}/pin`),
  unpin: (messageId: string) => api.del<OkResponse>(`/messages/${messageId}/pin`),
  suggestions: (params: { conversationId?: string; subjectUserId?: string; kind?: string } = {}) =>
    api.get<SuggestionsResponse>(`/suggestions${q(params)}`),
  acceptSuggestion: (id: string, body: Record<string, unknown> = {}) =>
    api.post<SuggestionAcceptedResponse>(`/suggestions/${id}/accept`, body),
  dismissSuggestion: (id: string) => api.post<OkResponse>(`/suggestions/${id}/dismiss`),
  /** Several steps, one approval (R37), and a step taken back. */
  acceptSuggestions: (ids: string[]) =>
    api.post<SuggestionsAcceptedView>('/suggestions/accept', { ids }),
  undoSuggestion: (id: string) => api.post<OkResponse>(`/suggestions/${id}/undo`),

  // Search, notifications, policies, safety
  /** `understand`: the person has finished typing (a pause, Enter), so a sentence may go to the model. */
  search: (term: string, understand = false) =>
    api.get<SearchResponse>(`/search${q({ q: term, understand: understand ? '1' : undefined })}`),
  /** How a search ended: found or not, and how long it took. Never what was searched for. */
  searchOutcome: (outcome: { found: boolean; ms: number }) =>
    api.post<OkResponse>('/search/outcome', outcome),
  notifications: () => api.get<NotificationsResponse>('/notifications'),
  markNotificationsRead: (body: { ids?: string[]; all?: boolean }) =>
    api.post<OkResponse>('/notifications/read', body),
  policies: () => api.get<PoliciesResponse>('/policies'),
  /** A rule of one's own (PRD §68): for a kind of relationship, a role in it, or one person. */
  createPolicy: (body: {
    name?: string | null;
    scope: { sphere?: Sphere | null; role?: string | null; connectionId?: string | null };
    settings: Record<string, unknown>;
  }) => api.post<PolicyCreatedResponse>('/policies', body),
  updatePolicy: (id: string, body: Record<string, unknown>) =>
    api.patch<OkResponse>(`/policies/${id}`, body),
  deletePolicy: (id: string) => api.del<OkResponse>(`/policies/${id}`),
  /** How Caime treats one person now, in words, and what they'd get without a rule of their own. */
  policyFor: (userId: string) => api.get<EffectivePolicyResponse>(`/policies/for/${userId}`),
  resetPolicies: () => api.post<OkResponse>('/policies/reset'),
  /** Automations (PRD §69): what Caime keeps of what arrives, set up by the person it's for. */
  automations: () => api.get<AutomationsResponse>('/automations'),
  createAutomation: (body: {
    name?: string | null;
    when: Partial<AutomationWhen> & Pick<AutomationWhen, 'kinds'>;
    collection: string;
    enabled?: boolean;
  }) => api.post<IdResponse>('/automations', body),
  updateAutomation: (
    id: string,
    body: Partial<{
      name: string | null;
      when: Partial<AutomationWhen> & Pick<AutomationWhen, 'kinds'>;
      collection: string;
      enabled: boolean;
    }>,
  ) => api.patch<OkResponse>(`/automations/${id}`, body),
  deleteAutomation: (id: string) => api.del<OkResponse>(`/automations/${id}`),
  /** What's saved, by collection, and one collection (or all) a page at a time. */
  saved: () => api.get<SavedCollectionsResponse>('/saved'),
  savedItems: (collection?: string, before?: string) =>
    api.get<SavedItemsResponse>(`/saved/items${q({ collection, before })}`),
  saveMessage: (messageId: string, body: { collection?: string; assetId?: string } = {}) =>
    api.post<SavedResponse>(`/messages/${messageId}/save`, body),
  moveSaved: (id: string, collection: string) =>
    api.patch<OkResponse>(`/saved/${id}`, { collection }),
  unsave: (id: string) => api.del<OkResponse>(`/saved/${id}`),
  renameCollection: (from: string, to: string) =>
    api.post<CollectionRenamedResponse>('/saved/collections/rename', { from, to }),
  deleteCollection: (name: string) => api.del<OkResponse>(`/saved/collections${q({ name })}`),
  block: (userId: string) => api.post<OkResponse>('/blocks', { userId }),
  unblock: (userId: string) => api.del<OkResponse>(`/blocks/${userId}`),
  blockOrg: (orgId: string) => api.post<OkResponse>(`/orgs/${orgId}/block`),
  unblockOrg: (orgId: string) => api.del<OkResponse>(`/orgs/${orgId}/block`),

  // Organizations' updates (PRD §59)
  orgUpdates: (orgId: string, before?: string) =>
    api.get<OrgUpdatesView>(`/orgs/${orgId}/updates${q({ before })}`),
  /** With the poster's own id for it, so sending it again after a lost answer posts it once. */
  postUpdate: (orgId: string, body: string, clientId: string) =>
    api.post<OrgUpdateResponse>(`/orgs/${orgId}/updates`, { body, clientId }),
  editUpdate: (orgId: string, id: string, body: string) =>
    api.patch<OrgUpdateResponse>(`/orgs/${orgId}/updates/${id}`, { body }),
  removeUpdate: (orgId: string, id: string) => api.del<OkResponse>(`/orgs/${orgId}/updates/${id}`),
  follow: (orgId: string, notify?: boolean) =>
    api.put<FollowResponse>(`/orgs/${orgId}/follow`, notify === undefined ? {} : { notify }),
  unfollow: (orgId: string) => api.del<OkResponse>(`/orgs/${orgId}/follow`),
  readUpdates: (orgId: string) => api.post<OkResponse>(`/orgs/${orgId}/updates/read`),
  following: () => api.get<FollowingResponse>('/updates'),

  // Notifications in this browser (web push)
  pushKey: () => api.get<PushKeyResponse>('/push/vapid'),
  subscribePush: (body: {
    kind: 'webpush';
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  }) => api.post<OkResponse>('/push/subscriptions', body),
  unsubscribePush: (endpoint: string) => api.del<OkResponse>('/push/subscriptions', { endpoint }),
  report: (body: {
    userId?: string;
    messageId?: string;
    conversationId?: string;
    /** An organization, or one of its updates (with its orgId). */
    orgId?: string;
    updateId?: string;
    reason: 'spam' | 'scam' | 'harassment' | 'impersonation' | 'inappropriate' | 'other';
    details?: string;
  }) => api.post<OkResponse>('/reports', body),
};
