/**
 * The API contract (docs/ARCHITECTURE.md "API conventions"): every response shape the server
 * returns and the clients read. The server's view builders are annotated with these types, so a
 * field that drifts on either side is a compile error in both packages. Request bodies are the
 * zod schemas in ./schemas; everything here is a response. Types only: nothing here ships code.
 */
import type { z } from 'zod';
import type {
  AccountFailure,
  AccountProvider,
  AccountRunningUse,
  AccountState,
  AccountUse,
} from './accounts';
import type { AddressKind, AddressMethod } from './addresses';
import type { AgeMethod, AgeOutcome } from './age-assurance';
import type {
  AgentAction,
  AgentCitation,
  AgentDraftAction,
  AgentEvalFinding,
  AgentWhen,
} from './agents';
import type { AppCategory, AppProvides, ListingState } from './app-directory';
import type { ApiScope, WebhookEvent } from './apps';
import type { AttentionReason, AttentionSection } from './attention';
import type { AutomationWhen } from './automations';
import type { AppointmentBooking, BookingHours, BookingItem, OrderingSettings } from './booking';
import type { BusinessView, OrgCallsFrom, ThreadState } from './business';
import type { CallKind, CallOutcome, CallResult, CallState, GroupCallMemberState } from './calls';
import type { CatalogCollection } from './catalog';
import type { ContactAccount } from './contact-return';
import type { PayKindHint } from './countries';
import type { CustomKitDef, CustomKitIcon } from './custom-kits';
import type { CustomerField } from './customers';
import type { PublicJwk, SealedMessage } from './e2ee';
import type { Gender } from './i18n';
import type { IntakeForm } from './intake';
import type { SuggestionKind } from './intelligence';
import type { KitField } from './kits';
import type { Lean } from './learning';
import type { AiUse, AppPricing, ListingCheck } from './marketplace';
import type { OrgKind, OrgRole } from './orgs';
import type { PaymentSettings } from './payments';
import type { OrgPlaceAudience, PlaceKind, PlaceParts, PlacePoint } from './places';
import type { ModelTier, OrgAllowance, OrgPlan, PersonAllowance } from './plans';
import type { EffectivePolicy, NotificationLevel, RelationshipPolicy } from './policy';
import type { Audience, PrivacySettings } from './privacy';
import type { Repeat } from './repeat';
import type { Preferences } from './schemas';
import type { ParsedQuery } from './search';
import type { SpaceKind, SpaceRole } from './spaces';
import type { Fit, Sphere, SphereGroup } from './taxonomy';
import type { Trust } from './trust';

// --- People ---------------------------------------------------------------------------------

/** A person, an app's bot, an organization's agent, Cai (R67) or a Caime Friend. */
/** A provisional person (R75) wrote in by mail and hasn't claimed an account: seen by whoever they wrote to, found by nobody. */
export type UserKind = 'human' | 'bot' | 'agent' | 'assistant' | 'character' | 'provisional';
export type Plan = 'personal' | 'pro' | 'business' | 'enterprise';
/** What the account owner chose. */
export type PresenceSetting = 'auto' | 'available' | 'busy' | 'away' | 'invisible';
/** What other people see, after privacy. */
export type PresenceState = 'online' | 'busy' | 'away' | 'offline';
export type UserPreferences = z.infer<typeof Preferences>;
export type BubbleTheme = NonNullable<UserPreferences['bubbleTheme']>;

export interface QuietHours {
  days: number[];
  start: string;
  end: string;
}

/** Every country, named in the asker's language, and the one their device suggests. */
export interface CountriesView {
  /** Each with its main time zone (R76): what a country change offers. */
  countries: Array<{ code: string; name: string; zone: string }>;
  suggested: string | null;
}

/** Every time zone, with its city, its country named in the asker's language, and its offset now. */
export interface TimeZonesView {
  zones: Array<{
    zone: string;
    city: string;
    country: string | null;
    countryName: string | null;
    offset: string;
  }>;
  /** The asker's device's time zone, by the name the list has for it. */
  suggested: string | null;
}

/** Every currency a country uses (ISO 4217), named in the asker's language. */
export interface CurrenciesView {
  currencies: Array<{ code: string; name: string }>;
}

export interface MeView {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  /** Their address at Caime's mail domain (R75): for an adult where mail is on, else null. */
  mailAddress: string | null;
  displayName: string;
  kind: UserKind;
  /** 'YYYY-MM-DD', never shown to anyone else; none for an app or an agent. */
  birthDate: string | null;
  minor: boolean;
  locale: string;
  timeZone: string;
  /** Where they live (ISO 3166-1), which sets their defaults. */
  country: string | null;
  /** Their country's currency (ISO 4217), the default for an amount they write. */
  currency: string | null;
  workweek: number[];
  /** What their country sets (R76): the calendar's first day, the weekend, the clock, the ways people are paid there. */
  weekStart: number;
  weekend: number[];
  hour12: boolean;
  payKinds: PayKindHint[];
  quietHours: QuietHours | null;
  plan: Plan;
  avatarUrl: string | null;
  bio: string | null;
  /** A line about what they do (M16 D4), shown by their Work details setting. */
  headline: string | null;
  pronouns: string | null;
  /** How they said Caime should refer to them (R81), or null: never guessed. */
  gender: Gender | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: PresenceSetting;
  privacy: PrivacySettings;
  preferences: UserPreferences;
  aiEnabled: boolean;
  onboarded: boolean;
  /** They said their recovery codes are saved (R56); until then the app keeps asking, once per screen. */
  recoveryCodesSeen: boolean;
  /**
   * R122: true while a child's account waits for their parent or guardian to agree to it (the
   * app shows only that wait); left out otherwise.
   */
  waitsForParent?: boolean;
  /** What a check of their age found (M16 B7), or null: never checked. Theirs alone to see. */
  ageCheck: AgeCheckView | null;
  /** Whether this Caime checks ages at all (a provider is set): Settings' row and the sheet. */
  ageCheckOffered: boolean;
  createdAt: string;
}

/** What a check of someone's age found (M16 B7): its outcome, how, and when; never an image. */
export interface AgeCheckView {
  outcome: AgeOutcome;
  method: AgeMethod;
  checkedAt: string;
  /** Until when an under-18 outcome holds (a year from the check); null for 18 or over. */
  holdsUntil: string | null;
}

export interface PersonView {
  id: string;
  handle: string;
  displayName: string;
  kind: UserKind;
  avatarUrl: string | null;
  bio: string | null;
  pronouns: string | null;
  /** As they said it (R81), where their privacy shows it to the viewer; else null. */
  gender: Gender | null;
  statusText: string | null;
  statusEmoji: string | null;
  presence: PresenceState | null;
  lastSeenAt: string | null;
  /** A line about what they do, where their Work details setting shows it to the viewer. */
  headline: string | null;
  trust: Trust;
}

export type RelationshipStatus = 'active' | 'ended' | 'archived' | 'superseded' | 'merged';

/** How I classify someone. Directional and private to me unless `shared` (PRD §9, §34). */
export interface RelationshipView {
  id: string;
  sphere: Sphere;
  role: string | null;
  roleLabel: string | null;
  orgName: string | null;
  contextNote: string | null;
  label: string;
  status: RelationshipStatus;
  isPrimary: boolean;
  shared: boolean;
  source: string;
  startedAt: string;
  endedAt: string | null;
}

export interface ConnectionStateView {
  state: 'connected' | 'outgoing' | 'incoming' | 'none';
  connectionId: string | null;
  requestId: string | null;
}

/** Only when both people chose to share their classification (PRD §53). */
export interface MutualFit {
  fit: Fit;
  theirLabel: string;
}

export type AttentionOverride = 'auto' | 'priority' | 'normal' | 'quiet';

export interface ConnectionView {
  connectionId: string;
  person: PersonView;
  nickname: string | null;
  attention: AttentionOverride;
  mutedUntil: string | null;
  archived: boolean;
  connectedAt: string;
  lastInteractionAt: string | null;
  relationships: RelationshipView[];
  conversationId: string | null;
  /**
   * Other accounts you said are this same person (PRD §51, a duplicate merged): shown with this
   * one in People, and separated again whenever you like.
   */
  also: Array<{ connectionId: string; person: PersonView; conversationId: string | null }>;
  /** You said this account is the same person as another connection of yours (by user id). */
  mergedInto: string | null;
}

export interface ConnectionRequestView {
  id: string;
  direction: 'incoming' | 'outgoing';
  person: PersonView;
  note: string | null;
  /** Context the requester chose to share. Their private classification never is. */
  context: { sphere: Sphere; label: string; orgName: string | null } | null;
  createdAt: string;
}

/** Context an inviter or a requester chose to show (PRD §52): the sphere's name, and where. */
export interface SharedContext {
  sphere: Sphere;
  label: string;
  orgName: string | null;
}

/** An invite link of mine (R1): whoever opens it lands connected with me, as I said I know them. */
export interface InviteView {
  id: string;
  token: string;
  /** The link to share (`WEB_URL/i/<token>`). */
  url: string;
  relationship: RelationshipView | null;
  context: SharedContext | null;
  note: string | null;
  /** How many people joined through it. */
  uses: number;
  expiresAt: string;
  createdAt: string;
}

/** An invite as whoever opens it sees it: who invites, the context they chose to show, a line. */
export interface InviteOpenView {
  inviter: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  context: SharedContext | null;
  note: string | null;
  /** For whoever is signed in: it's their own, or they're connected already (then where). */
  mine: boolean;
  conversationId: string | null;
}

export type InviteAcceptView =
  | {
      status: 'connected';
      connectionId: string;
      conversationId: string;
      /** True when they were connected before this: nothing changed. */
      already: boolean;
    }
  /**
   * An adult opened an under-18's link and the two share no connection (R29): the link stands
   * as a request the inviter decides on, never a connection formed behind them.
   */
  | { status: 'requested'; requestId: string };

export interface PeopleSearchResult {
  person: PersonView;
  connection: ConnectionStateView;
  relationship: RelationshipView | null;
}

/**
 * A contacts file into People (R79): who, of the addresses in it, is on Caime and findable by
 * address (`discoverByEmail`, as search finds them). The server keeps nothing of the file or
 * the addresses; the app shows the rest a count and offers an invite link.
 */
export interface ContactMatchView {
  /** The address as sent, lower-cased, so the app pairs it with the contact it came from. */
  email: string | null;
  /** Or the number as sent (R91), found because its owner proved it theirs. */
  phone: string | null;
  person: PersonView;
  connection: ConnectionStateView;
}
export interface ContactsMatchResponse {
  matches: ContactMatchView[];
}

/**
 * A Google or Microsoft account the person connected (R90), for the uses they turned on. Its
 * address, never its credentials; whether it works; when its calendar was last read.
 */
export interface ConnectedAccountView {
  id: string;
  provider: AccountProvider;
  email: string | null;
  uses: AccountUse[];
  state: AccountState;
  createdAt: string;
  syncedAt: string | null;
  /**
   * Its calendar is read from the main calendar alone (R96): Google's list of calendars wasn't
   * granted, or the connection was made before it was asked for. Connecting again reads them all.
   */
  mainCalendarOnly: boolean;
  /** How each of its uses that runs on its own last went (M16 G2), for the uses it has. */
  health: AccountUseHealthView[];
}
/** How a use that runs on its own last went (M16 G2): a good read never hides a failing push. */
export interface AccountUseHealthView {
  use: AccountRunningUse;
  /** When it last worked: the calendar last read, the plans last put in step. */
  workedAt: string | null;
  /** Why its last try failed, and when; null when its last try worked. */
  failure: AccountFailure | null;
  failedAt: string | null;
  /**
   * Plans the provider refused on their own `PUSH_TRIES` times, each waiting for its card to
   * change (M16 G4); always 0 for the calendar read.
   */
  stuck: number;
}
export interface ConnectedAccountsResponse {
  accounts: ConnectedAccountView[];
  /** The providers this Caime can connect (it has their clients); none, and nothing is offered. */
  offered: AccountProvider[];
  /** The uses each provider offers here: Google's files need its picker's key (R90). */
  usesOffered: Record<AccountProvider, AccountUse[]>;
}

/** An email address or phone number someone added as theirs (R91), proven or waiting for its code. */
export interface OwnAddressView {
  id: string;
  kind: AddressKind;
  /** Lower-cased email, or the number in E.164. */
  value: string;
  verified: boolean;
  /** How it was proven; null until it is. */
  method: AddressMethod | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface OwnAddressesResponse {
  addresses: OwnAddressView[];
  /** How a phone number can be proven here: by WhatsApp when its sender is set up, else none yet. */
  phoneBy: AddressMethod[];
}

export interface OwnAddressResponse {
  address: OwnAddressView;
}

/** A file or folder in a connected account's drive, as its browser lists it (R90). */
export interface AccountFileView {
  id: string;
  name: string;
  folder: boolean;
  /** Bytes; null for a folder or where the provider doesn't say. */
  size: number | null;
  mime: string | null;
  modifiedAt: string | null;
}

export interface AccountFilesResponse {
  items: AccountFileView[];
  /** The next page's key, or null at the end. */
  next: string | null;
}
export interface ConnectedAccountResponse {
  account: ConnectedAccountView;
}
/** Where to send the person to give the account's consent. */
export interface AccountStartResponse {
  url: string;
}

/**
 * The accounts contacts can be read from here (R89), each with the API the device reads it on:
 * only those this Caime has a client for.
 */
export interface ContactAccountView {
  id: ContactAccount;
  api: string;
}
export interface ContactAccountsResponse {
  accounts: ContactAccountView[];
}
/** Where to send the person to give an account's consent. */
export interface ContactAccountStartResponse {
  url: string;
}

/**
 * A place (R92): a named address and, when its owner took it where they stood, its point. Who
 * sees it is said only to whoever set it: a person's `audience`, an organization's `orgAudience`.
 */
export interface PlaceView extends PlaceParts {
  id: string;
  kind: PlaceKind;
  /** The owner's own name for it, else its kind's. */
  label: string | null;
  point: PlacePoint | null;
  audience: Audience | null;
  orgAudience: OrgPlaceAudience | null;
}

export interface PlacesResponse {
  places: PlaceView[];
}

/** What a card's "Where" may be filled from in a conversation: your places, and theirs you see. */
export interface ConversationPlacesResponse {
  mine: PlaceView[];
  theirs: Array<{ owner: string; places: PlaceView[] }>;
}

export interface PersonProfileView {
  person: PersonView;
  /** The organizations they're on the team of (R43), shown as their professional details are. */
  organizations: OrgRef[];
  /**
   * In an agreed meeting or appointment right now (R51), until when, as their rules for the
   * viewer allow (`busy`); what it is only to those allowed (`busyDetails`) or in its conversation.
   */
  busy: { until: string; title: string | null } | null;
  /** They take bookings (R58): their hours and the items this viewer may book, or null. */
  booking: { hours: BookingHours; items: BookingItem[] } | null;
  /** They take orders (R60): how, and what this viewer may order of them, or null. */
  ordering: { settings: OrderingSettings; items: BookingItem[] } | null;
  /** The collections this viewer may see (R61), for grouping what they may book or order. */
  collections: CatalogCollection[];
  /** They have a way to be paid this viewer may see (R62): Pay is offered. */
  payable: boolean;
  /** Their places this viewer may see (R92), in their order. */
  places: PlaceView[];
  connection: ConnectionStateView;
  blockedByMe: boolean;
  relationships: RelationshipView[];
  mutual: MutualFit | null;
  conversations: Array<{
    id: string;
    title: string;
    isGeneral: boolean;
    lastMessageAt: string | null;
  }>;
  summary: {
    messages: number;
    files: number;
    links: number;
    decisions: number;
    openActions: number;
    waiting: number;
    /** What your conversations with them are about ("Project Alpha"). */
    contexts: Array<{ id: string; title: string; kind: string }>;
    /** How often the two of you have talked lately, in words (never a score), and when last. */
    rhythm: Rhythm | null;
    lastTalkedAt: string | null;
    /** Their questions and requests since you last wrote to them, and yours since they did. */
    theirAsks: number;
    myAsks: number;
    /** What they see of you, by your rules for them: a limited view, or your privacy settings. */
    privacy: 'limited' | 'standard';
  };
  /**
   * What Caime remembers of the two of you across every conversation (M11): the latest
   * decisions, and what's still promised either way. The viewer's own data only; nothing here
   * is anyone else's to see.
   */
  memory: {
    decisions: Array<{ id: string; title: string; decidedAt: string; conversationId: string }>;
    promises: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      conversationId: string | null;
      /** `theirs`: you're waiting on them; `mine`: they're waiting on you. */
      direction: 'theirs' | 'mine';
    }>;
  };
}

/** How often two people have talked in the last twelve weeks (PRD §67, §71). */
export type Rhythm = 'most_weeks' | 'now_and_then' | 'rarely' | 'not_lately';

export interface RelationshipHistoryView {
  current: RelationshipView[];
  history: RelationshipView[];
  events: Array<{
    id: string;
    relationshipId: string;
    kind: string;
    before: unknown;
    after: unknown;
    at: string;
  }>;
  mutual: MutualFit | null;
}

export interface SphereInfo {
  id: Sphere;
  label: string;
  plural: string;
  group: SphereGroup;
  primary: boolean;
  roleQuestion: string;
  asksOrganization: boolean;
  quickRoles: Array<{ id: string; label: string }>;
  moreRoles: Array<{ id: string; label: string; gendered: boolean }>;
  customRoles: Array<{ id: string; label: string }>;
}

export interface TaxonomyResponse {
  primary: SphereInfo[];
  more: SphereInfo[];
  /**
   * Where the person knows people from, to pick for "Where?": the organizations they're on the
   * team of, then the places they've named, most people first.
   */
  organizations: Array<{ name: string; people: number }>;
}

// --- Messaging ------------------------------------------------------------------------------

export type ConversationKind = 'direct' | 'group' | 'business' | 'community' | 'broadcast';
export type MessageKind =
  | 'text'
  | 'media'
  | 'file'
  | 'voice'
  | 'location'
  | 'contact'
  | 'poll'
  | 'kit'
  | 'sticker'
  | 'system';

export interface FileView {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  /** Drawn small: a tile, a face, a logo (480 px at most). */
  thumbUrl: string | null;
  /** Drawn large: a photo in a message, a sheet, a page (1280 px at most, R70). */
  previewUrl: string | null;
  /**
   * A page of what a Word document, a workbook, a deck, a list of values or plain words holds,
   * drawn by the server (M16 H6): what a browser opens in place of the download. Null for any
   * other file, and for one too large to read.
   */
  viewUrl: string | null;
}

/** Something shared in a conversation, from its asset index (PRD §26). */
export interface AssetView {
  id: string;
  kind: 'photo' | 'video' | 'document' | 'audio' | 'link' | 'location' | 'contact';
  url: string | null;
  title: string | null;
  host: string | null;
  messageId: string | null;
  /** Where its message is in the conversation, to go to it. */
  messageSeq: number | null;
  /** To a customer, someone on an organization's team shows as the organization (R15). */
  senderId: string | null;
  createdAt: string;
  file: FileView | null;
  /** The conversation it was shared in. */
  conversationId: string;
  /**
   * Where a list spans conversations (the files between two people, a space's, M16 H6): who
   * shared it, by the name they show, and the topic or conversation it's in by its title. Null in
   * a conversation's own list, whose screen has both.
   */
  senderName: string | null;
  where: string | null;
  /** The viewer may give out a link to its file (their own, M16 H6). */
  linkable: boolean;
}

export interface AssetsResponse {
  /** Everything of each kind the viewer can see, whole; a kind with none is left out. */
  counts: Partial<Record<AssetView['kind'], number>>;
  /** Newest first. */
  assets: AssetView[];
  /** Where the next page starts, when there's more. */
  nextBefore: string | null;
}

/**
 * What a link's page says of itself (M16 E4c), read once by the server: its title, a line of
 * description, the site's name, and Caime's own small copy of its picture (`imageUrl`, served
 * by Caime, so the reader's device never asks the site). Null on a message without one.
 */
export interface LinkPreviewView {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

/**
 * The group's message a private reply answers (M16 E3b), read again for whoever reads it:
 * `preview` (and its seq and writer) only while they may still read it there, so none of the
 * group's words are kept in the chat. `title` is the group's name, null once they've left it.
 */
export interface PrivateReplyView {
  conversationId: string;
  messageId: string;
  title: string | null;
  seq: number | null;
  senderId: string | null;
  preview: string | null;
}

export interface ReactionView {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
}

/** An album's photos, as a card shows them: how many, and the latest few. */
export interface AlbumView {
  count: number;
  photos: FileView[];
}

/** One photo in an album, with who added it (to know who may take it out). */
export interface AlbumPhotoView {
  file: FileView;
  addedBy: string | null;
  addedAt: string;
}

/** What an import made (R45): the topic it landed in, and how much. */
export interface ImportChatView {
  conversationId: string;
  imported: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  /** Only for the sender's own messages: the id their device chose, for reconciling echoes. */
  clientId: string | null;
  senderId: string | null;
  /** Sent by a bot or an agent, never a person, and says so wherever it's shown (R16). */
  automated: boolean;
  /** Written by an organization's AI agent (PRD §75): shown as "AI agent", never as a person. */
  aiAgent: boolean;
  kind: MessageKind;
  body: string | null;
  payload: Record<string, unknown>;
  mode: string;
  entities: Record<string, unknown>;
  mentions: string[];
  replyTo: {
    id: string;
    seq: number;
    senderId: string | null;
    preview: string;
    kind: string;
  } | null;
  /** A group's message this answers privately (M16 E3b). */
  privateReply: PrivateReplyView | null;
  /** The first link's page, as the server read it (M16 E4c). */
  link: LinkPreviewView | null;
  forwarded: boolean;
  urgent: boolean;
  isQuestion: boolean;
  isRequest: boolean;
  reactions: ReactionView[];
  files: FileView[];
  poll: { counts: Record<string, number>; mine: string[]; voters: number } | null;
  /** A shared album card: how many photos, and the latest few (PRD §41). */
  album: AlbumView | null;
  /** Sent through a token or an app its sender let act for them, not typed in Caime: its name. */
  sentVia: string | null;
  /** Came or went as mail (R75): then `mail` says more. */
  channel: 'mail' | null;
  mail: MessageMailView | null;
  /**
   * In a private conversation (R18): the message as its sender's device sealed it, for this
   * device to open; `body` is null. The sender's id for it is `sealed.cid`.
   */
  sealed: SealedMessage | null;
  /** Kept at the top of its conversation for everyone in it (PRD §22). */
  pinnedAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** How far a message sent as mail got, as the provider tells it (R75): never a read by a pixel. */
export type MailDelivery = 'sent' | 'delivered' | 'bounced';

/** A message that came or went as mail (R75): the thread's subject, the other side's address, and how far one sent got. */
export interface MessageMailView {
  direction: 'in' | 'out';
  subject: string | null;
  /** The sender's address for mail in, the recipient's for mail out. */
  address: string;
  delivery: MailDelivery | null;
  deliveryAt: string | null;
  /** It came with HTML (R75 phase 2): "View as sent" opens it in a sandbox. */
  hasHtml: boolean;
  /** A mail in's signature, set apart from its words (folded under them). */
  signature: string | null;
  /** A mail out they've seen: they replied, or opened it in Caime. */
  seenAt: string | null;
  /** A mail out the provider saw opened (its pixel): probably read, never certainly. */
  openedAt: string | null;
  /** A mail in whose sender Caime couldn't confirm (M16 F1): `address` is only what it claims. */
  unverified: boolean;
}

/** What the mail provider's inbound webhook is answered (R75): each address here the mail reached, and what became of it there. */
export interface MailInboundResponse {
  received: true;
  outcomes: Array<{ to: string; outcome: string }>;
}
/** What the provider's delivery webhook is answered: how many messages it moved. */
export interface MailEventsResponse {
  received: true;
  applied: number;
}

export interface ParticipantView {
  userId: string;
  role: string;
  person: PersonView;
  /** My classification of them. */
  relationship: RelationshipView | null;
  /** Null when read receipts aren't visible between us (reciprocal, R25). */
  readSeq: number | null;
  deliveredSeq: number;
  /** Since when they've been in it (the last time they were added), for who'd run it next. */
  joinedAt: string;
}

export interface ContextRef {
  id: string;
  kind: string;
  title: string;
  purpose: string | null;
  status: string;
  deadlineAt: string | null;
}

export type RequestDirection = 'incoming' | 'outgoing';

/** The space a conversation belongs to. */
export interface SpaceRef {
  id: string;
  name: string;
  kind: SpaceKind;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  title: string;
  /**
   * Its own name, as its owner and admins change it: `title` without the space's name in front
   * ("Weekend plans" of "Family · Weekend plans"). Null when it takes a name from elsewhere (a
   * person's, a space's General, an organization's).
   */
  name: string | null;
  space: SpaceRef | null;
  /** A topic's own name (PRD §58): of a one-to-one, or of a group, whose name is `title`. */
  topic: string | null;
  /** Its topics the viewer is in, the liveliest first. */
  topics: Array<{ id: string; title: string; lastMessageAt: string | null }>;
  /** A one-to-one between two people connected now: topics start only there (PRD §58). */
  connected: boolean;
  /**
   * With someone reached by mail (R75): the subject a mail from here carries, the thread's
   * ("Re: …" of the latest mail either way); null when none went yet, or nobody here is.
   */
  mailSubject: string | null;
  /** Bulk or no-reply mail (R75): read here, never answered. */
  notice: boolean;
  /**
   * A notice of mail whose sender Caime couldn't confirm (M16 F1): the address it claims, which
   * is all its stand-in is named by; null for any other conversation.
   */
  unverifiedSender: string | null;
  purpose: string | null;
  isGeneral: boolean;
  parentId: string | null;
  privacyClass: 'standard' | 'private';
  retentionDays: number | null;
  context: ContextRef | null;
  participants: ParticipantView[];
  other: ParticipantView | null;
  /** A conversation with an organization (R15): who it is; for its team, the thread. */
  business: ConversationBusinessView | null;
  me: {
    role: string;
    lastReadSeq: number;
    attention: AttentionOverride;
    mutedUntil: string | null;
    archived: boolean;
    pinned: boolean;
    /** Marked unread to come back to (M16 E3b): opening it clears the mark. */
    markedUnread: boolean;
    draft: string | null;
    requestState: 'pending' | 'accepted' | 'declined' | null;
  };
  request: RequestDirection | null;
  /**
   * Someone in it is under 18 (R29): cards that involve money or where someone is aren't offered,
   * and in a business conversation its team knows the customer is.
   */
  hasMinor: boolean;
  /**
   * What's open between the viewer and the others here (R66): their actions either way, how many
   * and the soonest due, for the line above the composer. Null when nothing is.
   */
  open: { count: number; nextDueAt: string | null } | null;
  /** How many messages the viewer wrote here to be sent later (M16 E8b), waiting or not sent. */
  scheduled: number;
  lastSeq: number;
  lastMessageAt: string | null;
  createdAt: string;
}

/** A message written now and sent later (M16 E8b), as its sender sees it: theirs alone. */
export interface ScheduledMessageView {
  id: string;
  conversationId: string;
  body: string;
  replyToId: string | null;
  sendAt: string;
  /** Why it couldn't be sent when its time came, in the sender's language; null while waiting. */
  failure: string | null;
  createdAt: string;
}

/** `GET /conversations/:id/scheduled`: the asker's own, the soonest first. */
export interface ScheduledMessagesResponse {
  scheduled: ScheduledMessageView[];
}

/** `POST /conversations/:id/scheduled`. */
export interface ScheduledMessageResponse {
  scheduled: ScheduledMessageView;
}

export interface MessagesPage {
  messages: MessageView[];
  lastSeq: number;
  hasMore: boolean;
}

/**
 * Something that reached a person (M16 G5), as a webhook delivery says an event: a new message
 * in one of their conversations, with where it is and who sent it as they see them.
 */
export interface FeedEventView {
  /** Unique to the event, and what a poller dedupes by: a new message's is the message's id. */
  id: string;
  event: 'message.created';
  createdAt: string;
  data: {
    conversation: {
      id: string;
      kind: ConversationKind;
      /** As their inbox names it: the other person, the group, the organization; a topic's group. */
      title: string | null;
      topic: string | null;
    };
    /** Who sent it as the person sees them: to a customer, the organization (R15). */
    from: { id: string; name: string; handle: string | null } | null;
    /** Its words, or what it is when it has none ("📷 Photo"). */
    text: string;
    /** A card as a webhook says a card (its kind, fields, state, what was booked or ordered). */
    card: Record<string, unknown> | null;
    message: MessageView;
  };
}

export interface FeedResponse {
  events: FeedEventView[];
  /** Passed back as `after`, only what came since, oldest first. */
  next: string;
}

export interface InboxItemView {
  id: string;
  kind: ConversationKind;
  title: string;
  space: SpaceRef | null;
  topic: string | null;
  isGeneral: boolean;
  parentId: string | null;
  /** A private one (R18) takes only what's sealed on a device: nothing forwarded into it. */
  privacyClass: 'standard' | 'private';
  other: PersonView | null;
  /** The organization, in a customer's conversation with one (R15). */
  org: OrgRef | null;
  relationship: { label: string; sphere: Sphere } | null;
  memberCount: number;
  lastMessage: {
    id: string;
    seq: number;
    senderId: string | null;
    kind: MessageKind;
    preview: string;
    mine: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  unreadMentions: number;
  /** Marked unread to come back to (M16 E3b): a dot where a count would be. */
  markedUnread: boolean;
  lastActivityAt: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  attention: AttentionOverride;
  draft: string | null;
  request: RequestDirection | null;
  lastSeq: number;
  section: AttentionSection;
  reasons: AttentionReason[];
  rank: number;
}

export interface InboxSectionView {
  section: AttentionSection;
  label: string;
  items: InboxItemView[];
}

export type SectionCounts = Partial<Record<AttentionSection, number>>;

export interface InboxResponse {
  sections: InboxSectionView[];
  counts: SectionCounts;
  headline: string;
}

export interface InboxAllResponse {
  conversations: InboxItemView[];
  counts: SectionCounts;
  headline: string;
}

// --- Actions, memory, suggestions -----------------------------------------------------------

export type TaskStatus = 'open' | 'accepted' | 'declined' | 'done' | 'cancelled';
/** mine: mine to do · waiting: I'm waiting on them (private) · asked_me · i_asked (they see it). */
export type TaskDirection = 'mine' | 'waiting' | 'asked_me' | 'i_asked';

export interface TaskView {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  direction: TaskDirection;
  shared: boolean;
  owner: { id: string; displayName: string };
  /** `id` is null when the person it waited on deleted their account. */
  assignee: { id: string | null; displayName: string };
  /**
   * When it's due. Due on a day (`dueOn`), that day's 09:00 on the reader's clock, as its owner's
   * is kept, so a reader anywhere reads it on its day.
   */
  dueAt: string | null;
  /** The day it's due on when it has no time, the same for every reader (R119). */
  dueOn: string | null;
  dueHasTime: boolean;
  remindAt: string | null;
  /** Its owner handed it to Cai (R68): Cai offers a follow-up at the remind time. */
  caiFollowUp: boolean;
  conversationId: string | null;
  messageId: string | null;
  source: { preview: string; senderId: string | null; createdAt: string } | null;
  contextId: string | null;
  relationship: string | null;
  origin: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskCounts {
  todo: number;
  waiting: number;
  asked_me: number;
  overdue: number;
}

export interface TasksResponse {
  tasks: TaskView[];
  counts: TaskCounts;
}

/**
 * The Attention home (R66), beside the inbox's own "needs you": what the reader waits on others
 * for (oldest first), what's coming up in the next three days, and at most one thing Cai would
 * ask about, a wait gone quiet, rather than assume it's still open or done.
 */
/**
 * Where a wait on someone stands (M17 I2), as every nudge about it says it: they said it would be
 * done by a day that has passed (`promised`, `since` that day), nothing from them where it was
 * asked since it was asked (`unanswered`, `since` then), or neither can be said (`waiting`). What
 * arrived is offered "Mark done" instead of being asked about.
 */
export type WaitState = 'promised' | 'unanswered' | 'waiting';

export interface AttentionHomeResponse {
  waiting: TaskView[];
  waitingCount: number;
  comingUp: CalendarItemView[];
  /** A wait with no news for three days or more, not asked about since: still waiting? */
  ask: { taskId: string; since: string; state: WaitState } | null;
  /** Invitations to a group or a space, waiting for this person's answer (M16 B4). */
  invitations: PlaceInvitationView[];
}

/**
 * What someone missed (M17 I3, R66): the Needs-you conversations with something new, ranked as
 * Attention ranks them, each with what the rules read in what others wrote since this person last
 * read (asked of them, promised, decided, coming up), and, asked for with AI assist on, a summary
 * that cites its lines. `GET /attention/missed`; Cai's chat answers "what did I miss" from it.
 */
export interface MissedResponse {
  conversations: MissedConversationView[];
  /** Everything others wrote since this person last read, across the conversations listed. */
  unread: number;
  /** Needs-you conversations with something new beyond the ones listed. */
  more: number;
  summary: MissedSummaryView | null;
  label: string | null;
}

export interface MissedConversationView {
  id: string;
  title: string;
  kind: ConversationKind;
  /** What others wrote since this person last read. */
  unread: number;
  /** The first message they haven't read, for a tap to open the conversation there. */
  firstNewSeq: number;
  /** What the rules read, the newest of each kind, at most `MISSED_SHOWN`. */
  lines: MissedLineView[];
}

/** What a new message is to its reader: asked of them, a promise, a decision, or a card ahead. */
export type MissedKind = 'ask' | 'promise' | 'decision' | 'coming';

export interface MissedLineView {
  kind: MissedKind;
  seq: number;
  messageId: string;
  /** Who wrote it as the reader sees them: a person by name, an organization's team as it. */
  who: string;
  text: string;
  at: string;
}

/** The model's summary of what was missed, each source a line it rests on (R66: cited). */
export interface MissedSummaryView {
  text: string;
  sources: MissedSourceView[];
}

export interface MissedSourceView {
  conversationId: string;
  title: string;
  seq: number;
  messageId: string;
}

/**
 * An invitation to a group or a space (M16 B4): only what lets someone decide, as a join link's
 * page says it (the place, its kind, how many are in it, who asked); nothing of what's in it.
 */
export interface PlaceInvitationView {
  id: string;
  kind: 'group' | 'space';
  placeId: string;
  name: string;
  /** How many are in it now. */
  people: number;
  by: PersonView | null;
  createdAt: string;
  expiresAt: string;
}

/** Where an accepted invitation landed: the group, or the space. */
export interface InvitationAnsweredResponse {
  conversationId: string | null;
  spaceId: string | null;
}

/** Who an add put in, and who it asked instead (M16 B4: they come in by saying yes). */
export interface MembersAddedResponse {
  ok: true;
  added: string[];
  invited: string[];
}

/** A wait Cai follows up for its owner (R68). */
export interface CaiFollowUpView {
  taskId: string;
  title: string;
  /** Whom it waits on, as the owner sees them. */
  who: string;
  /** When Cai next offers a follow-up; null once offered and not sent. */
  at: string | null;
}

/** What Cai learned from one kind of suggestion (R68, M11): the counts, and what they teach. */
export interface CaiLearnedView {
  kind: SuggestionKind;
  accepted: number;
  dismissed: number;
  lean: Lean | null;
}

/** Settings · Cai (R68): what it keeps doing for you, and what it has learned, to forget. */
export interface CaiResponse {
  followUps: CaiFollowUpView[];
  learned: CaiLearnedView[];
  /** Learning from choices is on (`learnFromChoices`). */
  learning: boolean;
}

/** A follow-up Cai offered, sent by its owner's tap (R68). */
export interface FollowUpSentResponse {
  conversationId: string;
  messageId: string;
}

/**
 * What Cai or a friend offered to do for someone (M16 G14, R110), on its line's `payload.offer`:
 * written by the server alone, done by the person's tap.
 */
/**
 * On a line of Cai's that answered from the person's own messages (M17 I4): where its words came
 * from, each a tap to the message, the action or the decision.
 */
export interface CaiAnsweredPayload {
  sources: AnswerSourceView[];
}

export interface CaiOfferPayload {
  kind: 'message' | 'call' | 'meeting' | 'find' | 'move';
  /** Whom it's for: one of their people. */
  to?: { id: string; name: string };
  /** Their chat with `to`; null when there's none yet (the app opens it as it sends). */
  conversationId?: string | null;
  /** A message's words, as they'll go. */
  text?: string;
  video?: boolean;
  /**
   * A meeting card's title, start and minutes, as it'll go; `instead`, the next free start that
   * day when the time asked meets something already holding theirs (M17 I7), offered beside it.
   */
  meeting?: { title: string; at: string; minutes: number; instead?: string };
  /** What to look for, in Search. */
  query?: string;
  /**
   * A meeting or an appointment of theirs given another time (M17 I7): its card, its name, its
   * time now and the one suggested, whom the other side is when it's one (the organization, the
   * person), and the next free time beside it when the one asked meets something.
   */
  move?: {
    messageId: string;
    title: string;
    from: string;
    at: string;
    name?: string;
    instead?: string;
  };
  /** Done: what it sent, so a second tap sends nothing. */
  doneId?: string;
  doneAt?: string;
}

/** What Cai offered to do, done by its owner's tap (M16 G14): the message or the card it sent. */
export interface OfferDoneResponse {
  conversationId: string;
  messageId: string;
}

export interface DecisionView {
  id: string;
  conversationId: string;
  messageId: string | null;
  contextId: string | null;
  title: string;
  notes: string | null;
  decidedBy: { id: string; displayName: string | null } | null;
  decidedAt: string;
}

export interface SuggestionView {
  id: string;
  /** relationship · topic · task · reminder · waiting · decision · duplicate (R12: never a fact). */
  kind: string;
  title: string;
  rationale: string;
  confidence: number;
  payload: Record<string, unknown>;
  conversationId: string | null;
  messageId: string | null;
  subjectUserId: string | null;
  dueAt: string | null;
  dueText: string | null;
  createdAt: string;
}

/** What "Do all" did (R37): each step done, with what it made, or why it couldn't be. */
export interface SuggestionsAcceptedView {
  results: Array<{ id: string; accepted?: { type: string; id: string }; error?: string }>;
}

/** An organization where a conversation shows it (R15): who it is, and whether that's proven. */
export interface OrgRef {
  id: string;
  name: string;
  handle: string;
  kind: OrgKind;
  verified: boolean;
  verifiedDomain: string | null;
  /** Its country's currency (ISO 4217): the default for an amount on its team's cards. */
  currency: string | null;
  /** Its logo, if it has one. */
  avatarUrl: string | null;
}

/**
 * An organization's update (PRD §59): posted by its team to whoever follows it, and read as the
 * organization's, never a person's. Only the team sees who on it posted.
 */
export interface OrgUpdateView {
  id: string;
  org: OrgRef;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /**
   * Who posted it, for the team and the organization's own apps (null for everyone else): a person
   * on the team, or an app's bot, marked `automated` (R16).
   */
  postedBy: { id: string; displayName: string; automated: boolean } | null;
}

/** An organization's updates as someone sees them on its page. */
export interface OrgUpdatesView {
  updates: OrgUpdateView[];
  /** Older ones, from here (null when there are none). */
  nextBefore: string | null;
  /** Whether they follow it, and are told of each update. */
  following: { notify: boolean } | null;
  /** How many follow it: for its team only. */
  followers: number | null;
  /** They can post: its owner or an admin. */
  canPost: boolean;
  /** Following it isn't possible while they've blocked it. */
  blockedByMe: boolean;
}

/** An organization someone follows, in their Updates. */
export interface FollowingView {
  org: OrgRef;
  latest: OrgUpdateView | null;
  /** Posted since they last looked. */
  unread: number;
  notify: boolean;
}

/** A customer's conversation with an organization, as its team works it (PRD §38). */
export interface BusinessThreadView {
  conversationId: string;
  state: ThreadState;
  customer: PersonView | null;
  /** The organization the customer writes for (R64): the team answers it, through them. */
  customerOrg: OrgRef | null;
  assignee: { userId: string; displayName: string } | null;
  escalated: { at: string; byName: string | null; note: string | null } | null;
  resolvedAt: string | null;
  /** Since when the customer has been waiting for an answer. */
  waitingSince: string | null;
  lastMessage: {
    preview: string;
    senderName: string | null;
    fromCustomer: boolean;
    /** The organization's AI agent wrote it. */
    fromAgent: boolean;
    createdAt: string;
  } | null;
  /** Its AI agent handed it to the team (PRD §75), and stays out until it's resolved. */
  agentHandedOverAt: string | null;
  /** Its AI agent's draft waits here for someone on the team to check (M16 G6b). */
  agentDraft: boolean;
  unreadCount: number;
  lastActivityAt: string;
  /** Its customer blocked the organization: closed until they unblock it. */
  closed: boolean;
  /**
   * The team wrote first and the customer hasn't answered or accepted: to them it's a message
   * request (R14), and the team can write again once they do.
   */
  awaitingAcceptance: boolean;
  /** The customer is under 18 (R29): no money cards, and the team answers knowing it. */
  customerUnder18: boolean;
  /** The tags its team keeps on the customer (M16 H3), in the order they were given. */
  customerTags: string[];
  /** Erased at the customer's request (R54): its messages are gone, and it says so. */
  erasedAt: string | null;
}

/** What the team gets back from writing to someone first (R14). */
export interface StartThreadResult {
  conversationId: string;
  /** A new conversation, not the one the customer already had with the organization. */
  created: boolean;
  message: MessageView;
}

export interface ConversationBusinessView {
  org: OrgRef;
  /** For the customer: how far the organization has read and received their messages. */
  readSeq: number | null;
  deliveredSeq: number;
  /** For the team only: the thread's state, who has it, and why it's escalated. */
  thread: BusinessThreadView | null;
  /** For the customer: the organization they write as here (R64), or null for themselves. */
  asOrg: OrgRef | null;
  /** The customer blocked the organization: nobody writes in it until they unblock it. */
  closed: boolean;
  /** The organization closed (R42): what was sent stays to read, and nothing more is written. */
  orgClosed: boolean;
  /** Caime suspended the organization (M16 B3): to read, and nothing written until it's lifted. */
  orgSuspended: boolean;
  /** How long the organization keeps this conversation (R54), in days; null keeps it. Said to the customer. */
  retentionDays: number | null;
  /** For the team: the organization's intake forms by name (M16 H5), to send one; else null. */
  forms: Array<{ id: string; name: string }> | null;
  /** For the team: its AI agent's draft waiting to be checked here (M16 G6b); else null. */
  agentDraft: AgentDraftView | null;
  /**
   * For the customer: the organization takes their calls here (M16 H8a), its team rung and the
   * organization the one they see; false for the team and wherever it doesn't.
   */
  callable: boolean;
}

export interface BusinessInboxView {
  org: OrgRef;
  view: BusinessView;
  threads: BusinessThreadView[];
  counts: Record<BusinessView, number>;
}

/** Each of your organizations' inboxes, with what needs its team (R7: only what needs you). */
export interface BusinessSummaryView {
  orgs: Array<{ org: OrgRef; waiting: number; unassigned: number; mine: number }>;
}

/** An organization's app (PRD §73–75): its token, its bot, its webhook. Managers only. */
/**
 * Caime's own pages about itself, outside the app, at PUBLIC_URL/privacy, /terms and /help: a
 * link to one opens the page, never the app.
 */
export const SITE_PAGES = ['privacy', 'terms', 'help'] as const;
export type SitePage = (typeof SITE_PAGES)[number];

/**
 * The pages about Caime a visitor reads before signing in (R50: the public site, in the app's
 * shell but without its scripts, `lib/site-pages.ts`), at PUBLIC_URL/<page>. Each is a reserved
 * handle.
 */
export const MARKETING_PAGES = [
  'business',
  'pricing',
  'security',
  'developers',
  'marketplace',
  'about',
  'download',
] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

/**
 * Where someone uses Caime (R120): a browser's tab, the web app installed from it, the desktop
 * app, or a phone's app. The app says it once a launch (`PUT /auth/sessions/current/surface`), the
 * session keeps it, and product metrics count the week's people by it (`growth.surfaces`).
 */
export const SURFACES = ['browser', 'installed', 'desktop', 'ios', 'android'] as const;
export type Surface = (typeof SURFACES)[number];
/** The surfaces that are an app on the device rather than a tab: R120's number counts these. */
export const INSTALLED_SURFACES: readonly Surface[] = ['installed', 'desktop', 'ios', 'android'];

/**
 * Where this Caime keeps its policies and help, for About: its own pages, or where its operator
 * published them (the server's environment).
 */
export interface AboutView {
  privacyUrl: string | null;
  termsUrl: string | null;
  helpUrl: string | null;
}

export interface OrgAppView {
  id: string;
  name: string;
  /** The bot it answers customers as, if it does (R16: always labelled automated). */
  bot: { userId: string; displayName: string; handle: string } | null;
  scopes: ApiScope[];
  webhookUrl: string | null;
  events: WebhookEvent[];
  /** After a replacement, the secret before still signs deliveries until then (a second `v1`). */
  secretOverlapUntil: string | null;
  /** The start of its token, to tell tokens apart; the whole token is shown once. */
  tokenPrefix: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  /** The kinds of card it has made (PRD §74), by name. */
  kits: Array<{ key: string; name: string }>;
}

/**
 * Who an app's token is (GET /v1/apps/me): the app, the organization it belongs to (the id the
 * other routes take) and what it may do, so an integration's first call needs nothing it
 * wasn't given with the token.
 */
export interface AppMeView {
  app: {
    id: string;
    name: string;
    orgId: string;
    orgHandle: string;
    orgName: string;
    botUserId: string | null;
    scopes: ApiScope[];
    events: WebhookEvent[];
  };
}

/** One of an app's own kinds of card, as its token reads it back (GET /v1/kits). */
export interface AppKitView extends CustomKitDef {
  createdAt: string;
  updatedAt: string;
}

/** A kind of card someone on the team may send here, made by one of its apps. */
export interface CustomKitOfferView {
  app: { id: string; name: string };
  key: string;
  name: string;
  description: string;
  icon: CustomKitIcon;
  fields: KitField[];
}

/** What's shown once, when an app is made or its token or secret is replaced. */
export interface OrgAppSecretsView {
  app: OrgAppView;
  token: string | null;
  webhookSecret: string | null;
}

export interface WebhookDeliveryView {
  id: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/** What an @handle link opens: handles are one namespace, a person's or an organization's. */
export interface HandleView {
  kind: 'person' | 'org';
  id: string;
  handle: string;
}

/**
 * A closed organization that holds a handle (R42): what whoever asks for the handle is told,
 * so that, if they are the organization, they can prove its domain and take it back.
 */
export interface ClosedOrgView {
  id: string;
  name: string;
  /** The domain it was verified at: proving it again takes the organization back. */
  domain: string;
  closedAt: string;
}

/** Taking a closed organization back: the record to add at its domain, then check. */
export interface OrgReclaimView {
  org: { id: string; name: string; handle: string };
  domain: string;
  record: { name: string; type: 'TXT'; value: string };
}

/** An organization as anyone sees it (PRD §36, R15). */
export interface OrgSummaryView {
  id: string;
  name: string;
  handle: string;
  kind: OrgKind;
  about: string | null;
  website: string | null;
  /** It proved it controls `verifiedDomain` with a DNS record. */
  verified: boolean;
  verifiedDomain: string | null;
  memberCount: number;
  /** Your role, when you're on its team. */
  myRole: OrgRole | null;
  /** Where it's based (ISO 3166-1), and its currency, the default for its cards' amounts. */
  country: string | null;
  currency: string | null;
  /** Its own time zone and days worked (R76): its country's unless its owner or admins set them. */
  timeZone: string;
  workweek: number[];
  /** What its country sets (R76): the calendar's first day, the weekend, the clock, the ways people are paid there. */
  weekStart: number;
  weekend: number[];
  hour12: boolean;
  payKinds: PayKindHint[];
  /** The year it began, if it says. */
  foundedYear: number | null;
  /** Its logo, if it has one. */
  avatarUrl: string | null;
}

export interface OrgMemberView {
  userId: string;
  role: OrgRole;
  title: string | null;
  person: PersonView;
  joinedAt: string;
}

export interface OrgDomainView {
  name: string;
  verified: boolean;
  verifiedAt: string | null;
  /** The TXT record that proves it. */
  record: { name: string; type: 'TXT'; value: string };
  /**
   * Anyone with a proven address at it joins the team without an invite (M16 C3b), once it's
   * verified; someone the team removed never comes back this way.
   */
  joinByDomain: boolean;
}

export interface OrgView extends OrgSummaryView {
  createdAt: string;
  /**
   * The reserved handles this organization may take itself (owner, 2026-10-25): `@caime`, for its
   * owner and admins once its verified domain is the product's own (`PUBLIC_URL`'s, cai.me) and
   * nobody holds it; empty for everyone else.
   */
  claimableHandles: string[];
  /**
   * Suspended by Caime (M16 B3), for its team: since when and why. Nothing is written as it or
   * to it, its page answers as nobody's and its apps' tokens are refused until it's lifted.
   */
  suspension: { at: string; reason: string | null } | null;
  /** Its places this viewer may see (R92): all of them, with who sees each, for its team. */
  places: PlaceView[];
  /** Its team, for the people on it. */
  members: OrgMemberView[] | null;
  /** Verification, for its owner and admins. */
  domain: OrgDomainView | null;
  /** Its plan and what it uses of it, for its owner and admins. */
  plan: OrgPlanView | null;
  /** You blocked it: it can't write to you, and your conversation with it is closed. */
  blockedByMe: boolean;
  /** Its AI agent answers first (PRD §75): everyone sees that before they write. */
  agent: { name: string } | null;
  /** Its bookable hours (R51), for everyone: a customer books from the open slots in them. */
  booking: BookingHours | null;
  /** What can be booked (R58): the items this viewer may book; every one for its team. */
  bookingItems: BookingItem[];
  /** How it takes orders (R60), for everyone; null where it takes none. */
  ordering: OrderingSettings | null;
  /** Its collections this viewer may see (R61); every one for its team. */
  collections: CatalogCollection[];
  /** It has a way to be paid this viewer may see (R62): Pay is offered. */
  payable: boolean;
  /** How it's paid (R62), as set: for its owner and admins only, else null. */
  payments: PaymentSettings | null;
  /** What its automatic replies say (M16 H2): for its owner and admins only, else null. */
  replies: OrgRepliesView | null;
  /**
   * Its team's own apps reach its conversations (M16 G3): for its team, else null. Off, a token
   * acting as someone on it who doesn't run it is kept from them; its owner and admins never are.
   */
  memberApps: boolean | null;
  /** Who may call it (M16 H8a): for its owner and admins, else null. */
  callsFrom: OrgCallsFrom | null;
  /** The fields its team keeps for each customer (M16 H3): for its team, else null. */
  customerFields: CustomerField[] | null;
  /** How long it keeps its customers' conversations (R54), in days; null keeps them. */
  retentionDays: number | null;
  /** Its address at Caime's mail domain (R75): for its team where mail is on, else null. */
  mailAddress: string | null;
  /**
   * The viewer's proven address at its verified domain, when that lets them join its team now
   * (M16 C3b): an adult not on it, never removed from it. Null otherwise.
   */
  joinableAs: string | null;
  /** Their sign-in address at that domain, not confirmed yet: confirming it lets them join. */
  joinOnceConfirmed: string | null;
}

/**
 * What an organization's automatic replies say (M16 H2), each null while it's off: a greeting the
 * first time a customer writes (or after a quiet fortnight), and an away message while its
 * bookable hours say it's closed.
 */
export interface OrgRepliesView {
  greeting: string | null;
  away: string | null;
}

/**
 * What an organization's team keeps about one of its customers (M16 H3): a note, tags and its
 * fields' values, for the team alone; the customer never sees it.
 */
export interface CustomerRecordView {
  customerId: string;
  note: string | null;
  tags: string[];
  /** Each of the organization's fields this customer has a value for, by the field's id. */
  fields: Record<string, string>;
  updatedAt: string | null;
  /** Who on the team changed it last. */
  updatedBy: { userId: string; displayName: string } | null;
}

export interface CustomerRecordResponse {
  record: CustomerRecordView;
  /** The organization's fields, in its order: what the record may hold. */
  fields: CustomerField[];
}

/** The tags an organization's team uses, most used first (M16 H3): the inbox's filter. */
export interface CustomerTagsResponse {
  tags: Array<{ tag: string; count: number }>;
}

export interface CustomerFieldsResponse {
  fields: CustomerField[];
}

/** An organization's intake forms (M16 H5), in its order: for its team. */
export interface IntakeFormsResponse {
  forms: IntakeForm[];
}

/** A reply an organization's team keeps for what customers ask often (M16 H2). */
export interface QuickReplyView {
  id: string;
  shortcut: string;
  body: string;
}

export interface QuickRepliesResponse {
  replies: QuickReplyView[];
}

/**
 * The open slots in an organization's hours (R51), as instants, soonest first; none, with no
 * zone, where it takes no bookings (then a day and time are written as for any card).
 */
export interface SlotsView {
  timeZone: string | null;
  slotMinutes: number | null;
  /** The item the slots are for (R58), when one was asked; its length is each slot's. */
  item: Pick<BookingItem, 'id' | 'name' | 'unit' | 'minutes' | 'maxQuantity' | 'price'> | null;
  slots: string[];
}

/**
 * Someone's calendar in the app (R51): what their calendar feed shows, each item with whom it's
 * with, as the viewer sees them, and the relationship the viewer gave that person. Meetings and
 * appointments from cards in conversations they're in (agreed, or only asked), and their open
 * actions with a due date (their own, and what they were asked). Never from a private
 * conversation, never from a message request they haven't accepted.
 */
export interface CalendarItemView {
  /** A dated card (a meeting, an appointment, a Pay card or an invoice with a due date), or a task. */
  kind: 'meeting' | 'appointment' | 'payment_request' | 'invoice' | 'task';
  /** The card's message id, or the task's id. */
  id: string;
  /** A card's place in its conversation (R83: where Join opens it); null for a task. */
  seq: number | null;
  title: string;
  /**
   * When it is. For what's kept by a day (`on`), that day's first moment on the reader's clock,
   * so a list files it on its own day.
   */
  at: string;
  /**
   * Kept by a day, not a time (R119): a Pay card's or an invoice's due day as written, an
   * action's due day on its owner's clock. The same day for every reader; null for a time.
   */
  on: string | null;
  hasTime: boolean;
  /** A meeting's or an appointment's end, when it has a time. */
  endAt: string | null;
  place: string | null;
  /** Made of an invitation from someone's calendar (M16 F4): held where they say, never here. */
  invitation?: boolean;
  /**
   * A meeting's or an appointment's: held on Caime, so its Join opens its call (R83, M16 F6): its
   * Where says so and its conversation holds a call (core `heldOnCaime`).
   */
  heldHere?: boolean;
  /** A meeting that repeats (R58): how often, while it still does. */
  repeat: Repeat | null;
  /**
   * A time of a repeating meeting still to be posted: no card yet (its id is the series' and the
   * time's, `<series>:<n>`; its conversation and `seq` are the series' latest card's).
   */
  projected: boolean;
  /** What a Pay card or an invoice is for (review 2026-10-09 M14), on its due day. */
  amount: { value: number; currency: string } | null;
  conversationId: string | null;
  /** The person it's with: a direct conversation's other side, whom a task waits on or who asked. */
  with: PersonView | null;
  /** The viewer's relationship to that person, as their label says it. */
  relationship: { label: string; sphere: Sphere } | null;
  /** The organization, for a business conversation. */
  org: OrgRef | null;
  /** A group's or a space's conversation, when it isn't with one person. */
  conversationTitle: string | null;
  /**
   * A meeting or an appointment: agreed (accepted, confirmed) or only asked. A Pay card or an
   * invoice: open until its day, overdue past it. An action: open, waiting on someone, overdue.
   */
  state: 'agreed' | 'asked' | 'open' | 'waiting' | 'overdue';
}

/**
 * The brief before a meeting (R58): what Caime remembers of the two of you since the last such
 * card, as the reader sees it. Rules first; `summary` only when the reader has AI assist.
 */
export interface BriefView {
  messageId: string;
  conversationId: string;
  kit: 'meeting' | 'appointment';
  title: string;
  at: string;
  /** From when it looks: the previous agreed card's start, or a fortnight back. */
  since: string;
  /** Messages since then, counted. */
  messages: number;
  /**
   * How many times its time was moved to another (R119, M17 I19d): the plan moving alone, never
   * a time put back on its own clock.
   */
  moved: number;
  decisions: Array<{ id: string; title: string; decidedAt: string }>;
  /** `mine`: you promised them; `theirs`: they promised you. */
  promises: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    direction: 'mine' | 'theirs';
    /** How many times its due day moved. */
    moved: number;
  }>;
  /** Their questions since your last message: still unanswered. */
  questions: Array<{ messageId: string; preview: string; at: string }>;
  files: Array<{ id: string; name: string; kind: string }>;
  summary: string | null;
  label: string | null;
  /** The messages the summary rests on (M17 I4); empty without a summary. */
  sources: AnswerSourceView[];
}

export interface CalendarView {
  from: string;
  to: string;
  items: CalendarItemView[];
}

/** An organization's bookings (R51): the appointments its team agreed, or was asked, with customers. */
/** An organization's door (R53): the link that lands a customer in the conversation, and its QR code. */
export interface OrgDoorView {
  /** The link, on Caime's web origin, ending in `?write`. */
  url: string;
  /** The code of it: modules per side, and the dark modules as one SVG path in module units. */
  qr: { size: number; path: string };
  /**
   * The way to book beside it (C2a): the item's page when one item may be booked from a page,
   * else the organization's page listing them; null while nothing can be (no hours, no public
   * item). A visitor books there with or without an account (R97 (1)).
   */
  book: { url: string; qr: { size: number; path: string } } | null;
  /**
   * Its door on its own website (R117, M17 I17a): the page its site frames (`/o/<handle>/widget`)
   * and the one line to paste, null until a domain is verified, the only site that may frame it.
   */
  widget: { url: string; snippet: string; domain: string } | null;
}

/** A parent's open link for one child (R122), as its parent sees it: never its token. */
export interface FamilyLinkView {
  id: string;
  /** The name the parent gave the child, said on the link's page. */
  childName: string;
  expiresAt: string;
  createdAt: string;
}

/** A child on Caime through their parent's link (R122), as that parent sees them. */
export interface FamilyChildView {
  person: PersonView;
  /** `asked`: signed up through the link, waiting for the parent to agree; `agreed`: consented. */
  state: 'asked' | 'agreed';
  askedAt: string;
  agreedAt: string | null;
  /** Whether the parent's say still holds: until the child reaches the age where they live. */
  supervised: boolean;
  /** Whom the child is connected with while the parent's say holds; never a message. */
  connections: PersonView[];
}

/**
 * A request to connect that waits on a parent's yes (R122): their child asked someone, or someone
 * asked their child. Only the parent it waits on sees it, and the child when they asked.
 */
export interface FamilyRequestView {
  requestId: string;
  child: PersonView;
  /** The other side: whom the child asked, or who asked the child. */
  person: PersonView;
  /** True when the child asked; false when someone asked the child. */
  byChild: boolean;
  /** The words sent with it, to the parent before anyone else. */
  note: string | null;
  createdAt: string;
}

/** `GET /me/family` (R122): a parent's children and links, and a child's own parent. */
export interface FamilyResponse {
  children: FamilyChildView[];
  links: FamilyLinkView[];
  /** Requests to connect that wait on this parent's yes, oldest first. */
  requests: FamilyRequestView[];
  /**
   * For a child on Caime through their parent: that parent, whether they've agreed yet, whether
   * their say still holds (whom the child is connected with shows to them, and a request to
   * connect waits on them), and the requests the child made that wait on them now.
   */
  guardian: {
    person: PersonView;
    agreed: boolean;
    supervised: boolean;
    waiting: PersonView[];
  } | null;
  /** Whether this person may add a child: an adult with an account of their own. */
  mayAdd: boolean;
}

/** `POST /me/family/links`: the new link, and its address this once. */
export interface FamilyLinkResponse {
  link: FamilyLinkView;
  url: string;
}

/** `GET /family/:token`: whose link it is and for whom, for the sign-up screen. */
export interface FamilyLinkPublicResponse {
  guardianName: string;
  childName: string;
}

/**
 * A team invite as its organization's owner and admins see it (M16 C3a): never its token, which
 * is shown once, when it's made.
 */
export interface TeamInviteView {
  id: string;
  role: 'agent' | 'admin';
  /** The address it was sent to, or null for a link to share. */
  email: string | null;
  uses: number;
  expiresAt: string;
  createdAt: string;
}
export interface TeamInvitesResponse {
  invites: TeamInviteView[];
}
/** A new team invite and its link, shown this once. */
export interface TeamInviteMadeResponse {
  invite: TeamInviteView;
  url: string;
}
/** What a team invite offers whoever opens it signed in. */
export interface TeamInviteOpenView {
  org: {
    id: string;
    name: string;
    handle: string;
    kind: OrgKind;
    avatarUrl: string | null;
    verified: boolean;
  };
  role: 'agent' | 'admin';
  /** Who made it, by the name they show. */
  invitedBy: string | null;
  /** Already on the team: accepting changes nothing. */
  onTeam: boolean;
  /**
   * Whom it's for: anyone with the link; an address this account proved its own; an address of
   * this account's not yet confirmed; or an address that isn't this account's (never named).
   */
  addressed: 'anyone' | 'you' | 'unconfirmed' | 'elsewhere';
  expiresAt: string;
}
export interface TeamInviteOpenResponse {
  invite: TeamInviteOpenView;
}
export interface TeamInviteAcceptResponse {
  orgId: string;
  handle: string;
  already: boolean;
}
/** On a verified organization's team by an address at its domain (M16 C3b). */
export interface OrgJoinResponse {
  orgId: string;
  handle: string;
  already: boolean;
}

/**
 * A join link (M16 C3e): a group's or a space's, as its owner and admins list it. Never its
 * token, which comes back once, as `url`, when it's made.
 */
export interface JoinLinkView {
  id: string;
  /** How many joined through it. */
  uses: number;
  expiresAt: string;
  createdAt: string;
  /** Who made it, by the name they show. */
  by: string | null;
  /** It asks: whoever opens it asks, and its owner or an admin lets them in (C3h). */
  approval: boolean;
}
/**
 * A link to one of someone's own files (M16 H6), as its maker lists it: who opens it, until when,
 * and how many times its page was opened, never by whom. Never its token, which comes back once,
 * as `url`, when it's made.
 */
export interface FileLinkView {
  id: string;
  fileId: string;
  audience: 'anyone' | 'caime';
  opens: number;
  expiresAt: string;
  createdAt: string;
}
export interface FileLinksResponse {
  links: FileLinkView[];
}
export interface FileLinkMadeResponse {
  link: FileLinkView;
  url: string;
}
export interface JoinLinksResponse {
  links: JoinLinkView[];
}
export interface JoinLinkMadeResponse {
  link: JoinLinkView;
  url: string;
}
/**
 * What a join link offers whoever opens it signed in: where it leads, as a visitor's page says
 * it, and never who is in it by name.
 */
export interface JoinLinkOpenView {
  target: 'group' | 'space';
  name: string;
  purpose: string | null;
  /** A space's kind (a family, a team…); null for a group. */
  spaceKind: string | null;
  /** How many are in it now. */
  memberCount: number;
  /** The organization a space is its own, for its name and mark beside it. */
  org: OrgRef | null;
  /** Who made the link, by the name they show. */
  invitedBy: string | null;
  /** Already in it: opening it changes nothing. */
  member: boolean;
  expiresAt: string;
  /** It asks: whoever opens it asks, and its owner or an admin lets them in (C3h). */
  approval: boolean;
  /** Their ask through it: waiting, or declined (not asked again by this link); null for none. */
  asked: 'pending' | 'declined' | null;
}
export interface JoinLinkOpenResponse {
  link: JoinLinkOpenView;
}
/** In through an open link (or in already), or asked through one that asks (C3h). */
export type JoinLinkAcceptResponse =
  | {
      asked: false;
      /** Where to land: the group, or the space's General. */
      conversationId: string;
      spaceId: string | null;
      already: boolean;
    }
  | { asked: true; state: 'pending' | 'declined' };
/** Someone asking to join through a link that asks (C3h), as the place's owner and admins see them. */
export interface JoinRequestView {
  id: string;
  person: PersonView;
  createdAt: string;
}
export interface JoinRequestsResponse {
  requests: JoinRequestView[];
}

/**
 * An organization's export of its own conversations (R54): everything it is the controller of,
 * nothing of its people's own. The team by name; a customer named once per conversation.
 */
/**
 * How long a closed organization's export stays open to whoever owned it last (DPA §12); then
 * what was its alone is deleted, and its customers keep their conversations.
 */
export const CLOSED_ORG_EXPORT_DAYS = 30;

/** A closed organization whose export is still open to you, its last owner (DPA §12). */
export interface ClosedOrgExportView {
  id: string;
  name: string;
  handle: string;
  closedAt: string;
  exportUntil: string;
}

export interface ClosedOrgExportsResponse {
  orgs: ClosedOrgExportView[];
}

/**
 * Everything an organization holds on Caime (R54, DPA §8 and §12): what it is and offers, its
 * team, its agent, its apps, its updates and its conversations. Never a secret: no token, key
 * or webhook secret.
 */
export interface OrgExportView {
  exportedAt: string;
  organization: {
    id: string;
    name: string;
    handle: string;
    kind: string;
    about: string | null;
    website: string | null;
    foundedYear: number | null;
    country: string | null;
    timeZone: string | null;
    workweek: number[] | null;
    retentionDays: number | null;
    /** Its team's own apps reach its conversations (M16 G3). */
    memberApps: boolean;
    createdAt: string;
    /** Closed: when. Its export stays open to its last owner for `CLOSED_ORG_EXPORT_DAYS`. */
    closedAt: string | null;
  };
  /** Its AI agent (PRD §74), with the knowledge text it was given. */
  agent: {
    knowledge: string;
    paused: boolean;
    /** What it may do and when it answers (M16 G6a), whether its team checks it first (G6b). */
    mayBook: boolean;
    mayOrder: boolean;
    answersWhen: AgentWhen;
    review: boolean;
    createdAt: string;
    /** The questions it couldn't answer, by reference: the conversation and the message. */
    questions: Array<{
      conversationId: string;
      messageId: string;
      at: string;
      doneAt: string | null;
    }>;
    /** The drafts waiting for its team, as the customer would read them. */
    drafts: Array<{ conversationId: string; action: AgentDraftAction; body: string; at: string }>;
  } | null;
  /** Its own apps (PRD §74): what each may do and where it was told, and its kinds of card. */
  apps: Array<{
    name: string;
    scopes: ApiScope[];
    webhookUrl: string | null;
    events: WebhookEvent[];
    createdAt: string;
    revokedAt: string | null;
    cards: CustomKitDef[];
  }>;
  /** Its updates to followers (PRD §59), oldest first; who follows is never kept with them. */
  updates: Array<{ id: string; body: string; postedAt: string; editedAt: string | null }>;
  /** What it offers (R58–R62), as set: hours, catalog, collections, ordering, ways to be paid. */
  offer: {
    hours: BookingHours | null;
    items: BookingItem[];
    collections: CatalogCollection[];
    ordering: OrderingSettings | null;
    payments: PaymentSettings | null;
  };
  /** Its places (R92), with who each is shown to. */
  places: PlaceView[];
  /** What its team kept about its customers (M16 H3), with the fields it defined. */
  customers: {
    fields: CustomerField[];
    records: Array<{
      customerId: string;
      displayName: string | null;
      note: string | null;
      tags: string[];
      fields: Record<string, string>;
      updatedAt: string;
    }>;
  };
  /** Its intake forms (M16 H5), as they read now; the answers are on the cards in its conversations. */
  forms: IntakeForm[];
  /** What it says by itself (M16 H2): its greeting, its away message and its team's quick replies. */
  replies: {
    greeting: string | null;
    away: string | null;
    quick: Array<{ shortcut: string; body: string }>;
  };
  /** Its own checkout account (R65), if it connected one: the provider's id, never a key. */
  checkout: {
    provider: string;
    accountId: string;
    livemode: boolean;
    chargesEnabled: boolean;
    connectedAt: string;
  } | null;
  /** The apps published under it in Discover (R74), with where each listing stands. */
  listings: Array<{
    name: string;
    state: ListingState;
    tagline: string | null;
    category: string | null;
    askedAt: string | null;
    reviewedAt: string | null;
    declinedReason: string | null;
    developer: { displayName: string; handle: string };
  }>;
  /** Its team (as it stood when it closed, for a closed one). */
  team: Array<{ userId: string; displayName: string; role: string; since: string }>;
  /** Its team invites (M16 C3a), taken back and spent ones too: never a token. */
  invites: Array<{
    role: 'agent' | 'admin';
    email: string | null;
    uses: number;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
  conversations: Array<{
    conversationId: string;
    customer: { userId: string; displayName: string; handle: string } | null;
    /** The organization the customer writes for (R64), when they do. */
    customerOrg: { id: string; name: string; handle: string } | null;
    state: 'open' | 'resolved';
    startedByTeam: boolean;
    createdAt: string;
    erasedAt: string | null;
    messages: Array<{
      id: string;
      seq: number;
      from: 'customer' | 'team' | 'agent' | 'bot' | 'system' | 'unknown';
      senderName: string | null;
      kind: string;
      body: string | null;
      payload: Record<string, unknown> | null;
      files: Array<{ name: string; mime: string; size: number }>;
      createdAt: string;
      editedAt: string | null;
      deletedAt: string | null;
    }>;
  }>;
}

export interface OrgBookingView {
  /** The card's id, or `<series>:<n>` for a time of a repeating appointment ahead of it. */
  id: string;
  messageId: string;
  conversationId: string;
  customer: { id: string; displayName: string } | null;
  /** The organization the customer books for (R64), when they write for one. */
  customerOrg: OrgRef | null;
  title: string;
  at: string;
  hasTime: boolean;
  place: string | null;
  state: 'requested' | 'confirmed';
  /** What was booked (R58), when it came from the catalog; who on the team does it. */
  booking: AppointmentBooking | null;
  /**
   * A time of a repeating appointment not posted yet (R58): its series' latest card, held for
   * this time as the series will book it.
   */
  ahead: boolean;
  /** How often it repeats (R58), while it does. */
  repeat: Repeat | null;
}

export interface OrgCalendarView {
  from: string;
  to: string;
  items: OrgBookingView[];
}

/** An order (R60) in one of the organization's customer conversations, for its team's Orders view. */
export interface OrgOrderView {
  messageId: string;
  conversationId: string;
  customer: { id: string; displayName: string } | null;
  reference: string | null;
  summary: string | null;
  amount: { value: number; currency: string } | null;
  state: string;
  createdAt: string;
}
export interface OrgOrdersView {
  orders: OrgOrderView[];
}

/** An organization's AI agent, for its owner and admins (PRD §74–75). */
export interface OrgAgentView {
  name: string;
  /** What the organization told it: the only thing it answers from. */
  knowledge: string;
  /** Paused, it stays on the team and quiet; nothing it wrote goes away. */
  paused: boolean;
  /** Offers open times and books them for the team to confirm (M16 G6a). */
  mayBook: boolean;
  /** Writes down orders from the menu for the team to confirm. */
  mayOrder: boolean;
  /** Always, or only while the organization is closed by its hours. */
  answersWhen: AgentWhen;
  /** Its team checks each answer before it's sent (M16 G6b). */
  review: boolean;
  /** How many customers' questions it couldn't answer wait to be seen to. */
  questions: number;
  /** What it wrote to customers in the last 24 hours, against what the plan includes. */
  repliesToday: number;
  repliesPerDay: number;
  /** Caime's nightly test of the model its plan gives it (M16 G6c); null before one ran. */
  evaluated: AgentEvaluatedView | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The last night's run of the agent's evaluation on the model an organization's plan gives its
 * agent (M16 G6c), counted over the questions it was asked (a failed call asked nothing).
 */
export interface AgentEvaluatedView {
  at: string;
  asked: number;
  passed: number;
  wrongConfirmations: number;
}

/** What one run of the agent's nightly evaluation found on one model (M16 G6c). */
export interface AgentEvalRunView {
  model: string;
  /** The plans' tiers this model answers for. */
  tiers: ModelTier[];
  /** The version of the agent's instructions it ran (`PROMPT_VERSIONS.agent`). */
  promptHash: string | null;
  at: string;
  cases: number;
  /** Handled as they should be. */
  passed: number;
  handOvers: number;
  /** Cases a person should have been handed. */
  expectedHandOvers: number;
  /** Answered where a person was needed. */
  missedHandOvers: number;
  /** Handed over what it could have answered. */
  needlessHandOvers: number;
  /** Said something was confirmed or done that nobody did. */
  wrongConfirmations: number;
  /** Followed an instruction planted in the conversation. */
  rulesBroken: number;
  /** Answered without resting on the passage that says it. */
  uncited: number;
  wrongLanguage: number;
  wrongSlot: number;
  /** Calls that failed: asked nothing, counted apart. */
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** What the run cost at the price list's rates; null on a model the list doesn't name. */
  costUsd: number | null;
  /** Each case that went wrong, by its id, and how. */
  failures: Array<{ id: string; findings: AgentEvalFinding[] }>;
}

/** The operator's view of it: whether it runs nightly here, and the last run on each model. */
export interface AgentEvalResponse {
  enabled: boolean;
  at: string | null;
  runs: AgentEvalRunView[];
}

/** What an AI agent would do with a question, tried before it answers anyone. */
export interface AgentTryView {
  action: AgentAction;
  message: string;
  /** The passages of what it was told that its answer rests on (M16 G6a). */
  cited: AgentCitation[];
}

/**
 * A draft its AI agent left for its team to check before it's sent (M16 G6b): the team's alone,
 * never the customer's.
 */
export interface AgentDraftView {
  /** The customer's message it answers. */
  seq: number;
  action: AgentDraftAction;
  /** What the customer would read, its introduction too the first time. */
  body: string;
  /** Its answer alone, for a person to take into their own reply. */
  message: string;
  /** The passages of what it was told that it rests on. */
  cited: AgentCitation[];
  /** The time it would book, and what for, as the card would say. */
  booking: { at: string; title: string } | null;
  /** What it would write down as an order, and how it goes. */
  order: {
    lines: Array<{ name: string; quantity: number }>;
    fulfilment: 'pickup' | 'delivery' | null;
  } | null;
  createdAt: string;
}

/** A customer's question its AI agent couldn't answer from what it was told (M16 G6b). */
export interface AgentQuestionView {
  id: string;
  conversationId: string;
  /** Who asked, by name. */
  customer: string | null;
  /** Their words as they stand now. */
  text: string;
  at: string;
}

export interface AgentQuestionsResponse {
  questions: AgentQuestionView[];
}

/** An organization's plan (PRD §84): what it includes and how much of it is in use. */
export interface OrgPlanView {
  plan: OrgPlan;
  allowance: OrgAllowance;
  used: { teamSize: number; apps: number; startsToday: number; agentRepliesToday: number };
  /**
   * Its AI agent is quiet until this time because the last 24 hours' answers cost what its plan
   * allows (`agentEurPerDay`, M16 G9) before they reached the count; null otherwise.
   */
  agentHeldUntil: string | null;
  /** Where to see plans and upgrade, when the operator has set one up. */
  upgradeUrl: string | null;
}

/** How fast the team answers, over customers' waits that started in a period (PRD §71). */
export interface ReplyTimesView {
  /** Median time to the team's first answer, in minutes; null with nothing answered yet. */
  medianMinutes: number | null;
  answered: number;
  withinHour: number;
  /** Waits that started in the period and nobody on the team has answered yet. */
  unanswered: number;
}

/** A sum of money in one currency; `currency` is null where it was written without one. */
export interface MoneyTotal {
  value: number;
  currency: string | null;
}

/**
 * What an organization's conversations came to in a period (M16 H4): what was booked, ordered
 * and paid in them, which customers bought and which came back, and when customers write.
 * Counts and sums only: never a customer's name or words, and never one person on the team's.
 */
export interface OrgCommerceView {
  /**
   * Appointments asked for in the period, by the customer or the team (a repeating one once),
   * by where each stands now: confirmed (or done), cancelled, or still asked; and how many were
   * booked from the catalog.
   */
  bookings: {
    made: number;
    confirmed: number;
    cancelled: number;
    requested: number;
    fromCatalog: number;
  };
  /** Orders placed in the period, those cancelled since, and what the rest come to. */
  orders: { placed: number; cancelled: number; value: MoneyTotal[] };
  /**
   * Money the organization was paid in the period: Pay cards and invoices marked paid, the
   * largest sum first. Caime never holds it; this is what the cards say.
   */
  paid: MoneyTotal[];
  /**
   * Customers who wrote in the period; those who booked or ordered in it; and those of the
   * ones who wrote who were its customers before it.
   */
  customers: { wrote: number; bought: number; returning: number };
  /** What was booked or ordered most in the period, by its name then: up to five. */
  top: Array<{ name: string; count: number }>;
  /**
   * When customers wrote in the period, on the organization's clock (`timeZone`): messages by
   * hour from midnight (24) and by weekday, Sunday first (7).
   */
  byHour: number[];
  byWeekday: number[];
  timeZone: string;
  /** The period before, to compare. */
  previous: { bookings: number; orders: number; paid: MoneyTotal[] };
}

/** An organization's insights, for its owner and admins on Business (PRD §71, §84). */
export interface OrgInsightsView {
  days: number;
  from: string;
  to: string;
  /** Conversations a customer wrote in. */
  conversations: number;
  /** Conversations that started. */
  newConversations: number;
  reply: ReplyTimesView;
  /** Customers waiting for an answer right now. */
  waitingNow: number;
  resolved: number;
  escalated: number;
  /** The same for the period before, to compare. */
  previous: {
    conversations: number;
    newConversations: number;
    medianReplyMinutes: number | null;
    resolved: number;
  };
  /** What the conversations came to (M16 H4). */
  commerce: OrgCommerceView;
}

/** Someone in your insights: a connection of yours, as you see them. */
export interface InsightPersonRef {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Your one-to-one with them, to open. */
  conversationId: string | null;
}

/**
 * How your relationships are going (R47, Pro): worked out from your own one-to-ones and your
 * own labels, for you only. Nothing here is shown to anyone else, and nothing anyone else
 * labelled is in it. Business conversations and groups are left out: this is about people.
 */
export interface PersonInsightsView {
  days: number;
  from: string;
  to: string;
  /** Your connections now, and how you labelled them. */
  connections: { total: number; bySphere: Array<{ sphere: string; count: number }> };
  /** Connections you exchanged messages with in the window, and in the window before. */
  active: { count: number; previous: number };
  messages: {
    sent: number;
    received: number;
    previous: { sent: number; received: number };
  };
  /** How fast you answer in one-to-ones, and how fast you're answered. */
  reply: { yours: ReplyTimesView; theirs: ReplyTimesView };
  /** Who you wrote with most in the window, and your share of what was said. */
  closest: Array<InsightPersonRef & { messages: number; yourShare: number }>;
  /** Connections you'd written with before the window, and not since: drifting. */
  quiet: Array<InsightPersonRef & { lastAt: string }>;
  /** Your own messages by hour of your day (24 counts, from midnight). */
  hours: number[];
  /** Exchanges that began after a day or more of silence: who wrote first. */
  started: { byYou: number; byThem: number };
}

/** A report for the operator to review (R49): what was reported, by whom, and what of it. */
export interface ReportView {
  id: string;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  reason: string;
  details: string | null;
  createdAt: string;
  reporter: { id: string; handle: string; displayName: string } | null;
  /**
   * A visitor's report from a page (M16 B6): who wrote it without an account and where they're
   * told of the decision (both may be null for a child's safety), and the page it came from.
   */
  visitor: { name: string | null; email: string | null; page: string | null } | null;
  person: { id: string; handle: string; displayName: string; suspended: boolean } | null;
  org: { id: string; handle: string; name: string; suspended: boolean } | null;
  /** When it was actioned or dismissed; its evidence is kept a while after (M16 B3). */
  closedAt: string | null;
  /**
   * What the reporter saw when they reported it (M16 B3): the reported message and up to four
   * before it, each with its sender's name then, or the update's words; kept with the report.
   */
  evidence: ReportEvidenceView[];
  /** The message, as it is now: no words once removed, and none of a sealed one. */
  message: {
    id: string;
    conversationId: string;
    kind: string;
    body: string | null;
    sealed: boolean;
    removed: boolean;
    senderId: string | null;
    createdAt: string;
    /**
     * Brought over from another app (R45): the words are what the importer's file said, not
     * something the sender wrote here, so they weigh nothing against the sender.
     */
    imported: boolean;
  } | null;
  update: { id: string; body: string | null; removed: boolean } | null;
}

/** One thing a report holds as it was (M16 B3): never a sealed message's words. */
export interface ReportEvidenceView {
  messageId: string | null;
  senderId: string | null;
  senderName: string | null;
  kind: string;
  body: string | null;
  sentAt: string;
  /** The message reported itself, among those around it. */
  reported: boolean;
  /** Brought over from another app (R45): the importer's file's words, not the sender's here. */
  imported: boolean;
}

/** A share: how many of how many, and the rate when there are any. */
export interface Rate {
  count: number;
  of: number;
  rate: number | null;
}

/**
 * The product's health for its operator (PRD §82–83): aggregate counts and rates only, never
 * about anyone in particular and never what anyone said.
 */
export interface ProductMetricsView {
  window: { from: string; to: string; days: number };
  people: { total: number; active7d: number; active28d: number };
  /** Of the people who signed up in the window. */
  activation: {
    signedUp: number;
    connected: Rate;
    messaged: Rate;
    classified: Rate;
    /** Classified a connection and sent a first message within a day of signing up. */
    activated: Rate;
  };
  engagement: {
    messages: number;
    activePeople: number;
    activeConversations: number;
    activeConnections: number;
    /**
     * Of the calls of three or more people that ended in the window, those whose conversation one
     * of them wrote in while the call was on (R121: the chat beside a call, found).
     */
    callChat: Rate;
  };
  core: {
    connectionCompletion: Rate;
    relationshipCompletion: Rate;
    waitingResolution: Rate;
    attentionResolution: Rate;
    notificationEfficiency: Rate;
    retention: { day7: Rate; day28: Rate };
    /** Of what Needs you asked people that they dealt with: answered, not "doesn't need me". */
    needsYouPrecision: Rate;
    /** Searches in the app that ended with something opened, and the median time it took. */
    informationRetrieval: { found: Rate; medianSeconds: number | null };
    /**
     * Nothing slips (M17 I2): of the waits on someone whose day came in the window a week
     * earlier (so each has had its week), those closed within seven days of it.
     */
    waitsClosedOnTime: Rate;
  };
  value: { tasksFromMessages: number; suggestionsAccepted: Rate };
  /** Of the people who signed up in the window, those who came through someone's link. */
  growth: {
    invited: Rate;
    viaOrganizations: number;
    /** Sign-ups through a person's link, per person active in the window. */
    kFactor: number | null;
    /**
     * The door that needs no account (R97 (1), REVIEW §14 advantage 3): bookings made and
     * messages written from a page before an account in the window, and of the people who first
     * came through it either way 30 to 60 days ago, those who made an account with the same
     * address within thirty days of it. `fromSites` is how many of both started in an
     * organization's door on its own website (R117, M17 I17a), the council's number for it.
     */
    door: { booked: number; written: number; fromSites: number; joined: Rate };
    /**
     * Join links (M16 C3e): made and joined through in the window, the joins by an account made
     * for the link (`newPeople`, the number that shows a group moving over), and the asks through
     * links that ask (C3h), each of which joins once someone who runs the place lets them in.
     */
    joinLinks: { made: number; joined: number; newPeople: number; asked: number };
    /**
     * Meeting guests (R84, M16 C3f): who came in by their link in the window, and of guests, who
     * made it their account in the window (`kept`: by link keeping the meeting, or by address
     * signing up with it), the number that shows a meeting bringing someone in; and (M16 F6c) who
     * came in to a call in their one-to-one by the link their mail carried (`fromMail`: a page's
     * booker, whoever a meeting held on Caime was mailed to).
     */
    guests: { joined: number; kept: number; fromMail: number };
    /**
     * Chats brought over from WhatsApp (R45, M16 C3g) in the window: one-to-ones, groups, and how
     * many messages came with them, the number that shows a group moving over with its past.
     */
    imports: { chats: number; groups: number; messages: number };
    /**
     * Where the window's people used Caime (R120): people seen on each surface (one person may be
     * on several; `unknown` is a session from before a surface was said), and of everyone seen,
     * the share on an installed one, the number R120 holds above half.
     */
    surfaces: { people: Record<Surface | 'unknown', number>; installed: Rate };
  };
  ai: {
    calls: number;
    ok: number;
    byFeature: Record<string, { ok: number; other: number }>;
    /** Recaps of what someone missed the model summed up (M17 I3), and per active person. */
    recaps: { summaries: number; perActivePerson: Rate };
    cost: AiCostView;
  };
  business: {
    organizations: number;
    activeOrganizations: number;
    customerConversations: number;
    reply: ReplyTimesView;
    /**
     * Advantage 2's number (REVIEW-2026-10-17 §14, M16 H4): bookings and orders made in customer
     * conversations in the window (a repeating appointment once), and how many organizations
     * had any.
     */
    commerce: { bookings: number; orders: number; organizations: number };
  };
  /** What these numbers can't say yet, so nobody reads a gap as a zero. */
  notMeasured: string[];
}

/**
 * What the window's model calls cost (M16 H7; REVIEW-2026-10-17 §14, advantage 4's number), in
 * euros at the price list read on `priced` (the server's lib/ai-costs.ts) and the euro rate beside
 * it: in all, per person active in the window over thirty days, by the plan that answers for each
 * call, and by feature. Never anything about anyone in particular.
 */
export interface AiCostView {
  eur: number;
  perActivePersonMonth: number | null;
  byPlan: AiCostByPlanView[];
  byFeature: Record<string, number>;
  /** Calls on a model or a provider the list doesn't name, or a recording with no length kept. */
  unpriced: number;
  priced: string;
}

/** What AI cost on one plan in the window (M16 H7). */
export interface AiCostByPlanView {
  plan: Plan | OrgPlan;
  /** A person's plan with their seats, as it is now; an organization's for its agent. */
  whose: 'person' | 'organization';
  eur: number;
  /** How many people, or organizations, it was spent on. */
  count: number;
  /** What one of them costs over thirty days at the window's pace. */
  perMonth: number;
}

/** Your own plan: what it includes, and what you've used of it. */
export interface PlanUsageView {
  /** What your allowances come from: your own plan, or a seat's that includes more (M16 H1). */
  plan: Plan;
  allowance: PersonAllowance;
  /**
   * `aiShare` is how much of the last 24 hours' AI assist is used, 0 to 1, by what the calls cost
   * (M16 G9): said in words, never as a price.
   */
  used: { aiShare: number; storageBytes: number; automations: number };
  /** When there's AI assist again, once the last 24 hours' is used up. */
  aiNextAt: string | null;
  upgradeUrl: string | null;
  /** The organization whose seat includes it, when it's more than your own plan. */
  via: PlanSeatView | null;
}

/** A seat on an organization's team that includes a plan for its person (M16 H1). */
export interface PlanSeatView {
  orgId: string;
  name: string;
  plan: OrgPlan;
}

/** A space in the list (PRD §40). */
export interface SpaceSummaryView {
  id: string;
  name: string;
  kind: SpaceKind;
  purpose: string | null;
  memberCount: number;
  /** Unread messages across the space's conversations you're in. */
  unreadCount: number;
  lastActivityAt: string;
  myRole: SpaceRole;
  /** The organization it belongs to (R43), if one: its team can be in it. */
  org: OrgRef | null;
}

export interface SpaceMemberView {
  userId: string;
  role: SpaceRole;
  person: PersonView;
  /** How you know them, when you've said (private to you). */
  relationship: { label: string; sphere: Sphere } | null;
  joinedAt: string;
}

export interface SpaceConversationView {
  id: string;
  title: string;
  purpose: string | null;
  isGeneral: boolean;
  /** You're in it. Open conversations in a space can be joined by anyone in it. */
  joined: boolean;
  memberCount: number;
  unreadCount: number;
  lastMessageAt: string | null;
  /** Only for conversations you're in. */
  lastMessage: { preview: string; senderName: string | null; mine: boolean } | null;
}

/**
 * One of an organization's spaces, on its page (R43): its team sees the ones they're in; its
 * owner and admins see them all, and can join any.
 */
export interface OrgSpaceView extends Omit<SpaceSummaryView, 'myRole'> {
  myRole: SpaceRole | null;
  joined: boolean;
}

export interface SpaceView extends SpaceSummaryView {
  createdAt: string;
  generalId: string;
  members: SpaceMemberView[];
  conversations: SpaceConversationView[];
  /** The space's calendar (PRD §41): what's ahead in its conversations the viewer is in. */
  upcoming: Array<UpcomingView & { conversationTitle: string }>;
}

/** AI assist for this account: the server has a provider, the person turned it on, and may. */
export interface AiStatusView {
  available: boolean;
  enabled: boolean;
  /** Adults only for now. */
  eligible: boolean;
}

/** Everything a model wrote carries `label` ("Suggested by Cai") and waits for a tap (R17). */
export interface AiRewriteView {
  suggestion: string;
  label: string;
}

/** Where a meeting's short address leads its reader (M16 F6d): the card in its conversation. */
export interface MeetingLinkResponse {
  conversationId: string;
  seq: number;
  messageId: string;
  /**
   * Once its call is over and Cai's notes of it are written, for someone who was in it (M16 F6e):
   * the call's line, where the notes are opened.
   */
  notes: { callId: string; seq: number } | null;
}

/**
 * A reply Cai drafts for the reader to send (M17 I11b), from the conversation's own lines: put in
 * the composer only on their tap, never sent by Cai (R110). Null when there's nothing to answer.
 */
export interface AiDraftReplyView {
  suggestion: string | null;
  label: string | null;
}

export interface AiTranslationView {
  translation: string;
  /** The language it was translated into, e.g. "en" and "English". */
  to: string;
  language: string;
  label: string;
}

/**
 * Where an answer's words came from (M17 I4): a message, opened at its line; an action or a
 * decision; a line of a call's notes. Every answer the model gives from passages carries them.
 */
export type AnswerSourceView =
  | {
      kind: 'message';
      conversationId: string;
      messageId: string;
      seq: number;
      /** The conversation's title for the reader; null inside the conversation it's from. */
      title: string | null;
      who: string;
      at: string;
    }
  | { kind: 'decision'; id: string; title: string; conversationId: string | null }
  | { kind: 'task'; id: string; title: string; conversationId: string | null }
  | { kind: 'note'; lineId: string; at: string; speaker: string; text: string }
  /**
   * A call's notes away from them (M17 I12a): a line said (`lineId`) or Cai's write-up of the call
   * (`lineId` null), opened at the call's line in its conversation (`seq`).
   */
  | {
      kind: 'call';
      callId: string;
      conversationId: string;
      seq: number;
      lineId: string | null;
      /** The conversation's title for the reader; null for a chat of two. */
      title: string | null;
      /** Who said it; Cai for the write-up. */
      who: string;
      at: string;
    };

export interface AiCatchUpView {
  /** Null when there is nothing to read yet. */
  summary: string | null;
  label: string | null;
  /** Messages since the reader last read, among those summarized. */
  newCount: number;
  /**
   * Everything others wrote since the reader last read (M17 I3): more than `newCount` when the
   * catch-up read only the latest of it, which the app then says.
   */
  unread: number;
  /** The lines the summary rests on (M17 I4), the most telling first; each a tap to its message. */
  sources: AnswerSourceView[];
}

/**
 * A question about a conversation, answered from it for the one who asked (R67's "Cai in a
 * conversation"): shown with `label`, never kept anywhere (R17).
 */
export interface AiAnswerView {
  /** Null when the conversation has nothing to answer from yet. */
  answer: string | null;
  label: string | null;
  /** The messages the answer rests on (M17 I4), the most telling first. */
  sources: AnswerSourceView[];
}

/**
 * A question typed to Cai about a call, in any mode (R114 (2), M17 I13f): answered to the asker
 * alone from what they may read of the notes, citing its lines (as they may read them), kept
 * nowhere.
 */
export interface CallNotesAnswerView {
  /** Null when nothing has been said yet to answer from. */
  answer: string | null;
  label: string | null;
  /** The lines the answer rests on, the most telling first. */
  cited: Array<{ lineId: string; at: string; speaker: string; mine: boolean; text: string }>;
}

export interface AiActionsView {
  /** New suggestions, also in GET /suggestions; things already suggested or tracked are left out. */
  found: SuggestionView[];
  label: string;
}

/** A meeting or an appointment ahead, read from its card (PRD §41): asked, or agreed. */
export interface UpcomingView {
  messageId: string;
  conversationId: string;
  seq: number;
  kit: 'meeting' | 'appointment';
  title: string;
  at: string;
  hasTime: boolean;
  durationMinutes: number | null;
  place: string | null;
  /** Accepted (a meeting) or confirmed (an appointment); otherwise only asked. */
  agreed: boolean;
}

export interface MemoryView {
  summary: string;
  people: Array<{ id: string; displayName: string; role: string }>;
  peopleLine: string;
  decisions: Array<{ id: string; title: string; messageId: string | null; decidedAt: string }>;
  openItems: TaskView[];
  dates: Array<{ text: string; at: string; messageId: string }>;
  amounts: Array<{ text: string; value: number; currency: string | null; messageId: string }>;
  documents: Array<{
    id: string;
    title: string | null;
    fileId: string | null;
    /** Where it downloads from, while the file is still there. */
    url: string | null;
    /** Its page, for a document the server reads as one (M16 H6). */
    viewUrl: string | null;
    messageId: string | null;
  }>;
  links: Array<{ id: string; url: string | null; host: string | null; messageId: string | null }>;
  places: Array<{ id: string; title: string | null; messageId: string | null }>;
  /** Meetings and appointments ahead in it, soonest first. */
  upcoming: UpcomingView[];
  topics: string[];
  /** Whole counts: decisions and files in it, and what's open for the viewer (PRD §57). */
  counts: { messages: number; decisions: number; openItems: number; files: number };
  privacyClass: 'standard' | 'private';
}

export interface NotificationView {
  id: string;
  kind: string;
  level: NotificationLevel;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  count: number;
  delivery: string;
  reason: string | null;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationView[];
  unread: number;
}

/**
 * Of the notifications a phone shows, those still unread and what each says now: anything else
 * it shows (read, dismissed or gone elsewhere, or its words since taken back) it clears.
 */
export interface ShownNotificationsResponse {
  unread: Array<{ id: string; body: string | null }>;
}

export interface PolicyView extends RelationshipPolicy {
  description: string;
}

// --- Automations and what's saved (PRD §69) -------------------------------------------------

export interface AutomationView {
  id: string;
  name: string | null;
  when: AutomationWhen;
  collection: string;
  enabled: boolean;
  /** How many things it has saved, and when it last did. */
  runs: number;
  lastRunAt: string | null;
  /** "When a customer sends a file with “invoice”, save it to Customer Files" */
  description: string;
  createdAt: string;
}

export interface SavedCollectionView {
  name: string;
  /** What's in it that its owner can still see. */
  count: number;
  latestAt: string | null;
  /** How many of their automations save to it. */
  automations: number;
}

export interface SavedCollectionsResponse {
  collections: SavedCollectionView[];
  total: number;
  /** The most anyone keeps saved (automations.ts). */
  max: number;
}

export interface SavedItemView {
  id: string;
  collection: string;
  savedAt: string;
  /** Kept by one of their automations, not by hand. */
  automationId: string | null;
  conversation: {
    id: string;
    kind: string;
    /** A group's or a topic's name; a one-to-one has none, and a customer sees the organization's. */
    title: string | null;
  };
  message: {
    id: string;
    seq: number;
    kind: string;
    /** To a customer, someone on an organization's team shows as the organization (R15). */
    senderId: string | null;
    senderName: string | null;
    body: string | null;
    createdAt: string;
  };
  /** The files kept: the one saved, or every file of a message saved whole. */
  files: FileView[];
  /** A link saved on its own. */
  link: { url: string; host: string | null; title: string | null } | null;
}

export interface SavedItemsResponse {
  items: SavedItemView[];
  /** Where the next page starts, when there's more. */
  nextBefore: string | null;
}

// --- Search ---------------------------------------------------------------------------------

export interface SearchMessageHit {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  senderName: string | null;
  conversationTitle: string | null;
  /** The text around the match; matched words are marked for `snippetParts` (format.ts). */
  snippet: string;
  createdAt: string;
}

/**
 * What was said in a call, found (M17 I12a): a heard line of Cai's notes, for someone who was in
 * the call when it was said (or said it), or, among an answer's sources, Cai's write-up of the
 * call (`lineId` null), for someone in it from its first word. It opens the call's notes there,
 * from the call's line in its conversation (`seq`).
 */
export interface SearchCallHit {
  lineId: string | null;
  callId: string;
  conversationId: string;
  /** The call's line in its conversation, where its notes open. */
  seq: number;
  /** Who said it; null for the write-up. */
  speakerId: string | null;
  speakerName: string;
  conversationTitle: string | null;
  /** The words around the match, marked as a message's are. */
  snippet: string;
  /** When it was said. */
  at: string;
}

export interface SearchAssetHit {
  id: string;
  kind: string;
  url: string | null;
  host: string | null;
  title: string | null;
  conversationId: string;
  messageId: string | null;
  senderId: string | null;
  createdAt: string;
  file: FileView | null;
}

export interface SearchResults {
  people?: Array<{ person: PersonView; relationship: RelationshipView | null }>;
  /** By name: one from the searcher's relationships (how many people there), or one written to
   * (its handle and the conversation, which opens). */
  organizations?: Array<{
    name: string | null;
    people: number;
    handle?: string;
    conversationId?: string;
  }>;
  messages?: SearchMessageHit[];
  /** What was said in calls they were in (M17 I12a), with the messages. */
  calls?: SearchCallHit[];
  files?: SearchAssetHit[];
  tasks?: TaskView[];
  decisions?: Array<{
    id: string;
    title: string;
    conversationId: string;
    messageId: string | null;
    decidedAt: string;
  }>;
  contexts?: Array<{
    conversationId: string;
    title: string | null;
    kind: string;
    context: { title: string; kind: string | null } | null;
  }>;
}

/**
 * "Ask Cai" in Search (R66, R17): a question answered from what search finds in the asker's own
 * messages, decisions and to-dos, with the ones the answer rests on, as search lists them. Both
 * null when nothing was found to answer from: no model was asked.
 */
export interface SearchAnswerResponse {
  answer: string | null;
  label: string | null;
  sources: Pick<SearchResults, 'messages' | 'calls' | 'tasks' | 'decisions'>;
}

export interface SearchResponse {
  query: ParsedQuery;
  interpretation: ParsedQuery['interpretation'];
  results: SearchResults;
  /**
   * Who read the query: the rules, or a model when they understood nothing of a sentence and
   * the person has AI assist on (R17). With `ai`, `label` says so beside the interpretation.
   */
  understoodBy: 'rules' | 'ai';
  label: string | null;
}

// --- Account --------------------------------------------------------------------------------

export interface AuthResponse {
  user: MeView;
  /** Native clients only; the web gets an httpOnly cookie instead. */
  token: string | null;
  /** Shown once, at sign-up. */
  recoveryCodes?: string[];
}

/** A signed-out client with no credentials gets nulls, not a 401. */
export type SessionResponse =
  | { user: MeView; session: { id: string; kind: string } }
  | { user: null; session: null };

export interface DeviceSessionView {
  id: string;
  kind: string;
  deviceName: string | null;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

// --- Realtime -------------------------------------------------------------------------------

/** Events that carry data the client applies directly. */
export type RealtimeDataEvent =
  | { type: 'message.created' | 'message.updated'; data: MessageView }
  | { type: 'message.deleted' | 'message.hidden'; data: { id: string; conversationId: string } }
  | {
      type: 'message.sent';
      data: { conversationId: string; clientId: string; id: string; seq: number };
    }
  | {
      /** The sender's messages to be sent later here changed (M16 E8b): one went, or couldn't. */
      type: 'scheduled.changed';
      data: { conversationId: string };
    }
  | {
      type: 'reaction';
      data: {
        messageId: string;
        conversationId: string;
        userId: string;
        emoji: string;
        added: boolean;
      };
    }
  | { type: 'poll.updated'; data: { messageId: string; conversationId: string } }
  | {
      type: 'receipts';
      data: {
        conversationId: string;
        userId: string;
        readSeq: number | null;
        deliveredSeq: number | null;
      };
    }
  | { type: 'typing'; data: { conversationId: string; userId: string } }
  | { type: 'call.ringing' | 'call.updated'; data: CallView }
  | { type: 'call.signal'; data: CallSignalView }
  | { type: 'groupcall.ringing' | 'groupcall.updated'; data: GroupCallView }
  | { type: 'groupcall.signal'; data: GroupCallSignalView }
  /** Cai's notes in a call were asked for, began, moved to another recorder or stopped (M16 F7). */
  | {
      type: 'call.notes';
      data: { callId: string; conversationId: string; group: boolean; notes: CallNotesView };
    }
  /** Cai speaks in a call (M17 I13g): the words to everyone, the sound to the recorder's device. */
  | { type: 'call.cai'; data: CaiSpokenView }
  /** What Cai wrote to one person in a call (M17 I13g), to their devices alone. */
  | { type: 'call.cai.written'; data: CaiWrittenView }
  /** Cai, asked about the screen, asks the recording device for a picture of it (M17 I13h). */
  | { type: 'call.cai.frame'; data: CaiFrameAskView }
  | { type: 'presence'; data: { userId: string; state: PresenceState; at: string } }
  /** Someone's devices for private conversations changed: seal for the new set (R18). */
  | { type: 'devices.changed'; data: { userId: string; conversationIds: string[] } }
  | {
      type: 'notification.created' | 'notification.updated';
      data: {
        /** Null when many people were told at once (an update's fan-out): the list refreshes. */
        id: string | null;
        kind?: string;
        level: NotificationLevel;
        title: string;
        body: string | null;
        count?: number;
        data: Record<string, unknown>;
      };
    };

/** Events that only say what changed; the client refetches. */
export type RealtimeSignalType =
  | 'space.updated'
  | 'space.removed'
  | 'conversation.created'
  | 'conversation.updated'
  | 'connection.created'
  | 'connection.updated'
  | 'connection.removed'
  | 'connection.request'
  | 'connection.request.resolved'
  | 'relationship.changed'
  | 'relationship.shared'
  | 'policies.changed'
  | 'suggestion.created'
  | 'suggestion.resolved'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'decision.created'
  | 'decision.updated'
  | 'notifications.read'
  | 'block.changed'
  | 'me.updated'
  | 'business.updated'
  /** An organization someone follows (or whose team they're on) posted, changed or took back an update. */
  | 'updates.changed'
  /** What a conversation keeps pinned at its top changed. */
  | 'pins.changed'
  /** What someone saved changed: by hand, on another device, or by an automation of theirs. */
  | 'saved.changed'
  | 'automations.changed'
  /**
   * What's connected or listed for someone changed (review 2026-10-09 M15): an app granted or
   * ended, the calendar feed made or stopped, a listing of theirs changed or reviewed.
   */
  | 'apps.changed'
  /** A host's offer (hours, catalog, ordering, ways to be paid) was saved: `{ orgId }` or `{ orgId: null }` for their own. */
  | 'booking.changed'
  /** Someone asked to join a place one runs, or an ask was answered (C3h): `{ target, id }`. */
  | 'join.asked'
  /** A call's notes changed for those who read them: words heard, a line deleted (`{ callId }`). */
  | 'callnotes.changed'
  | 'invites.changed'
  /** A parent's family changed (R122): a child signed up, was agreed to or let go of. */
  | 'family.changed';

export type RealtimeEvent =
  | RealtimeDataEvent
  | { type: RealtimeSignalType; data: Record<string, unknown> };

export type RealtimeFrame =
  | { type: 'hello'; userId: string; serverTime: string }
  | { type: 'pong'; serverTime: string }
  | { type: 'event'; event: RealtimeEvent }
  /** The server lost its bus for a while: fetch what was said meanwhile (review 2026-10-17). */
  | { type: 'resync' };

/** A personal access token, as its owner sees it: never the token itself after it's made. */
export interface PersonalTokenView {
  id: string;
  name: string;
  scopes: string[];
  /** The first characters, to tell tokens apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/**
 * Someone's calendar feed (PRD §72): whether there is one and when a calendar last read it. Its
 * address is shown only as it's made; only its hash is kept.
 */
export interface CalendarFeedView {
  enabled: boolean;
  createdAt: string | null;
  lastReadAt: string | null;
}

/** A third-party app its developer registered (PRD §74): never its secret after it's made. */
export interface OAuthAppView {
  id: string;
  clientId: string;
  name: string;
  website: string | null;
  redirectUris: string[];
  /** It keeps a secret on a server; otherwise it proves itself with PKCE alone. */
  confidential: boolean;
  /** Until when the secret it had before the last replacement is still taken (M16 G1). */
  secretOverlapUntil: string | null;
  createdAt: string;
  /** Its listing in Discover (R74): what it says of itself, and where it stands. */
  listing: AppListingView;
  /** How many people have it connected now (kept by the grant's own transaction). */
  connectedCount: number;
}

/** An app published under an organization, as its owner and admins see it (M10). */
export interface OrgListingView {
  app: DirectoryAppView;
  /** Where its listing stands: unlisted, waiting for the operator, listed, or declined. */
  listing: ListingState;
  developer: { displayName: string; handle: string };
}
export interface OrgListingsResponse {
  apps: OrgListingView[];
}

/** What an app says of itself in Discover (R74), as its developer set it. */
export interface AppListingView {
  state: ListingState;
  tagline: string | null;
  description: string | null;
  category: AppCategory | null;
  /** What it gives Caime (R78): `APP_PROVIDES` entries, reviewed with the listing. */
  provides: AppProvides[];
  /** How it's paid for, its languages, where help and its privacy policy are (R80). */
  pricing: AppPricing | null;
  languages: string[];
  supportUrl: string | null;
  privacyUrl: string | null;
  /** What it says of putting people's words through a model; null when it doesn't. */
  aiUse: AiUse | null;
  /** Its screenshots' files, in order (R80). */
  screenshotIds: string[];
  /** Its address in the marketplace, given when it's first listed and kept (R80). */
  slug: string | null;
  iconFileId: string | null;
  /** Where Connect sends someone: the app's own sign-in, which asks Caime for a grant. */
  loginUrl: string | null;
  /** The organization it's published under, whose verification Discover shows. */
  orgId: string | null;
  /** Why the operator declined, when they did. */
  declinedReason: string | null;
  /** When it last asked (a change to what's shown asks again). */
  askedAt: string | null;
  /** The version of what's shown; a review names the one it looked at. */
  revision: number;
}

/** An app in Discover (R74): a listed one, or one of Caime's own. */
/**
 * Who made an app, the same wherever it's shown (consent, Connected, Discover): the organization
 * it's published under, else its developer, or Caime for its own. A handle links to their page.
 */
export interface AppPublisher {
  kind: 'person' | 'org' | 'caime';
  name: string;
  handle: string | null;
  /** A verified organization (R42); Caime's own count as verified. */
  verified: boolean;
}

export interface DirectoryAppView {
  /** An OAuth client's id, a built-in's name (`calendar`), or a bridge's (`zapier`, R79). */
  id: string;
  kind: 'oauth' | 'builtin' | 'bridge';
  name: string;
  tagline: string | null;
  description: string | null;
  category: AppCategory;
  /** What it gives Caime (R78); empty for a built-in or a bridge. */
  provides: AppProvides[];
  /** Its address in the marketplace (R80): a built-in's and a bridge's is its id. */
  slug: string | null;
  pricing: AppPricing | null;
  languages: string[];
  supportUrl: string | null;
  privacyUrl: string | null;
  aiUse: AiUse | null;
  /** Where its screenshots are served, 8:5, in order. */
  screenshots: string[];
  iconUrl: string | null;
  website: string | null;
  publisher: AppPublisher;
  connectedCount: number;
  /** Where Connect sends someone (an OAuth app's own sign-in); a built-in or a bridge connects in Caime. */
  connectUrl: string | null;
  /** The viewer connected it: a live grant, the built-in is on, or a bridge's token lives. */
  connected: boolean;
}

export interface DirectoryResponse {
  apps: DirectoryAppView[];
  nextBefore: string | null;
}
export interface DirectoryAppResponse {
  app: DirectoryAppView;
}

/** A listing waiting for the operator (R74): the app and who made it. */
export interface AppListingReviewView {
  id: string;
  name: string;
  website: string | null;
  listing: AppListingView;
  iconUrl: string | null;
  owner: { displayName: string; handle: string };
  org: { name: string; handle: string; verified: boolean } | null;
  askedAt: string;
  /** What to check before listing it (R80): the operator sends back every one to list. */
  checks: ListingCheck[];
  /** Where the operator sees its screenshots, in order. */
  screenshots: string[];
}
export interface AppListingsResponse {
  listings: AppListingReviewView[];
}
export interface AppListingReviewResponse {
  listing: AppListingReviewView;
}

/** What someone is asked when an app wants to act for them. */
export interface OAuthConsentView {
  app: {
    id: string;
    name: string;
    website: string | null;
    /** As Discover and Connected name it: the same publisher and icon (review 2026-10-09 M8). */
    publisher: AppPublisher;
    iconUrl: string | null;
  };
  scopes: Array<{ scope: string; label: string }>;
  redirectUri: string;
  /** They let it in before, with at least these permissions. */
  allowedBefore: boolean;
}

/**
 * Something that acts for someone or reads their data (R74): an app they let in (a grant), or
 * one of Caime's own built-ins that's on (the calendar address), each the same kind of row.
 */
export interface ConnectedAppView {
  /**
   * An app let in (a grant), a built-in that's on, a bridge whose token lives (R79: a personal
   * token made for the platform, listed as the platform), or a personal token of the person's own.
   */
  kind: 'oauth' | 'builtin' | 'bridge' | 'token';
  /** The directory's id for it (`DirectoryAppView.id`); a token's own id for a token. */
  appId: string;
  /** The grant, for an app someone let in; a built-in or a token has none. */
  grantId: string | null;
  name: string;
  website: string | null;
  /** Who made it: the organization or developer who published it, Caime, or the person (a token). */
  publisher: AppPublisher;
  iconUrl: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** A call (PRD §47), as either side sees it. */
export interface CallView {
  id: string;
  conversationId: string;
  kind: CallKind;
  state: CallState;
  outcome: CallOutcome | null;
  caller: { id: string; displayName: string; avatarUrl: string | null };
  callee: { id: string; displayName: string; avatarUrl: string | null };
  /** The device on each side that's in it: signals go only between these two. */
  callerDevice: string;
  calleeDevice: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  /** Cai taking notes in it (M16 F7): asked, on, or why it stopped; null when nobody asked. */
  notes: CallNotesView | null;
  /**
   * A customer's call to an organization (M16 H8a): its name, for the team's ring ("… is
   * calling Nile Dental"); to the customer the organization is the callee itself. Else null.
   */
  org: { name: string } | null;
}

/** Why Cai stopped taking notes in a call, or never started (M16 F7, R85). */
export type CallNotesWhy =
  /** Someone in the call pressed Stop. */
  | 'stopped'
  /** Someone asked said no. */
  | 'declined'
  /** Someone answered or joined without Cai (R85 (2)). */
  | 'joined_without'
  /** Someone under 18 is in the call (R29, R85 (3)): said to nobody as such. */
  | 'minor'
  | 'ended'
  /** Nobody who said yes is in the call on Caime in a browser (R82 (5), R85 (4)). */
  | 'no_recorder'
  /** What the asker may spend on AI today is spent (R107). */
  | 'allowance'
  /** Another mode took over, everyone having said yes to it (M17 I13b2). */
  | 'replaced';

/**
 * Another mode asked while one is on (R114, M17 I13b2): everyone in the call is asked again, and
 * the mode under way goes on until they have all said yes; anyone's no leaves it as it is.
 */
export interface CallNotesSwitchView {
  id: string;
  /** The mode asked for: Record, Cai joining in, both, or Notes alone. */
  records: boolean;
  interacts: boolean;
  askedBy: { id: string; displayName: string };
  /** Of the people in the call now, those who said yes to the switch. */
  yes: string[];
  waitingOn: Array<{ id: string; displayName: string }>;
}

/**
 * Cai taking notes in a call (M16 F7, R82 phase 1 under R85), the same for everyone who may see
 * the call: who asked, who in the call has said yes and who hasn't yet, and the device that
 * records while it's on. Never who said no, nor who stopped it.
 */
export interface CallNotesView {
  id: string;
  state: 'asking' | 'on' | 'stopped' | 'declined';
  askedBy: { id: string; displayName: string };
  /** Of the people in the call now, those who said yes. */
  yes: string[];
  /** While it's asked: who in the call hasn't answered yet. */
  waitingOn: Array<{ id: string; displayName: string }>;
  /** The device recording while it's on: a member's browser in the call. */
  recorderDevice: string | null;
  /**
   * Cai records the call too (R114 (1), M17 I13b): the voices of everyone who said yes and every
   * shared screen kept with the notes, so every choice offered names it ("Answer, Cai records").
   */
  records: boolean;
  /**
   * Cai joins in (R114 (3), M17 I13g): called by name it answers aloud from what the call shares,
   * so every choice offered names it ("Answer, Cai joins in"); what's one person's own it writes
   * to them alone.
   */
  interacts: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  why: CallNotesWhy | null;
  /** Another mode asked while this one is on (M17 I13b2); null: none. */
  switching: CallNotesSwitchView | null;
}

/**
 * Cai speaks in a call (R114 (3), M17 I13g): what it says and until when, to everyone in the call;
 * the notes' recorder device fetches the sound by the utterance's id and plays it into the call.
 */
export interface CaiSpokenView {
  callId: string;
  utteranceId: string;
  text: string;
  /** How long it plays, when known. */
  ms: number | null;
  until: string;
}

/**
 * What Cai wrote to one person in a call (M17 I13g): their own things, or what it prepared for
 * them in their chat with it; to their devices alone, kept nowhere.
 */
/**
 * Cai was asked about the screen (M17 I13h): the recording device sends a picture of the screen
 * shown now (`POST /calls/:id/cai/frame`), or says there's none (`…/frame/none`), for the line
 * that asked; Cai answers without one a moment later either way.
 */
export interface CaiFrameAskView {
  callId: string;
  /** The line of the notes that asked. */
  lineId: string;
  /** The one device asked: the notes' recorder. */
  deviceId: string;
}

/** The recording device answered Cai's ask (M17 I13h): `taken` false once the line was answered already. */
export interface CaiFrameResponse {
  taken: boolean;
}

export interface CaiWrittenView {
  callId: string;
  text: string;
  /** Where to continue, when there's somewhere: Cai's chat. */
  open: 'cai' | null;
}

/** One thing said in a call while Cai took notes, as someone who was in it reads it. */
export interface CallNoteLineView {
  id: string;
  speaker: CallPersonView;
  /** When it was said. */
  at: string;
  /** The words, once heard; null while Cai is still writing them. */
  text: string | null;
  /** The language Cai heard it in (a BCP 47 tag), when the provider said. */
  language: string | null;
  /** The reader's own words, which they may delete (R85 (2)). */
  mine: boolean;
}

/**
 * Cai's write-up of a call's notes (M16 F7e), for whoever was in it for all of it: what it was
 * about, its topics, what was decided and the next steps by person, as Cai wrote them.
 */
export interface CallNotesSummaryView {
  summary: string;
  /**
   * Each part with `at`, when the line it rests on was said, which opens the recording there (M17
   * I13c); null for one written before that, or a line the model didn't name.
   */
  topics: Array<{ title: string; points: string[]; at: string | null }>;
  decisions: Array<{ text: string; at: string | null }>;
  /** Whose step it is as the notes name them (null: nobody in particular), and by when. */
  nextSteps: Array<{ who: string | null; what: string; due: string | null; at: string | null }>;
  label: string;
}

/** `GET /calls/:id/notes`: what was said, from when the reader joined. */
export interface CallNotesResponse {
  callId: string;
  conversationId: string;
  /** The call's latest notes, as everyone in it saw them. */
  notes: CallNotesView | null;
  lines: CallNoteLineView[];
  /** Cai's write-up (M16 F7e): only for whoever heard it all; null while there's none. */
  summary: CallNotesSummaryView | null;
  /** Being written, written, or none to write (assist off, nothing heard); null: not theirs. */
  summaryState: 'writing' | 'written' | 'none' | null;
  /** The call's recording, the parts this reader was in the call for (M17 I13b); null: none. */
  recording: CallRecordingView | null;
}

/**
 * A call's recording (R114 (4), M17 I13b), as someone who was in it may play it: its parts from
 * when they were in the call, each made seekable once it ends.
 */
export interface CallRecordingView {
  /** Still being recorded, recorded, or deleted (the notes stay). */
  state: 'recording' | 'recorded' | 'deleted';
  /**
   * When it's deleted for everyone (thirty days on, or an organization's shorter retention);
   * null while someone keeps it.
   */
  until: string | null;
  /** Who keeps it past its day, against their storage (M17 I13d); null: nobody. */
  keptBy: CallPersonView | null;
  /** Whether this reader may keep it or let it go: they asked for it, and it's recorded. */
  mayKeep: boolean;
  parts: CallRecordingPartView[];
  /** What was on each shared screen, at each change of it (M17 I13h), of the parts listed. */
  frames: CallRecordingFrameView[];
}

/**
 * What a shared screen showed at a moment (M17 I13h): a frame the recording's browser kept at a
 * change of the screen, and what Cai read of it once the write-up read it.
 */
export interface CallRecordingFrameView {
  id: string;
  /** The screen part it's of. */
  partId: string;
  at: string;
  shownBy: CallPersonView | null;
  /** What the screen showed, as Cai read it for the write-up; null until then, or never read. */
  read: string | null;
  /** Where its picture is. */
  url: string;
}

/** One part of a recording: everyone's voices from a moment on, or one person's shared screen. */
export interface CallRecordingPartView {
  id: string;
  kind: 'voices' | 'screen';
  /** Whose screen a screen part is. */
  shownBy: CallPersonView | null;
  startedAt: string;
  endedAt: string | null;
  /** Its length as its own file says, once it's ready. */
  durationMs: number | null;
  /** Being recorded, being made ready to play, ready, or lost (nothing of it could be read). */
  state: 'recording' | 'finishing' | 'ready' | 'failed';
  mime: string;
  bytes: number;
  /** Where it plays from (byte ranges), once it's ready. */
  url: string | null;
}

/**
 * `GET /messages/:id/recording`: a call's recording shared into a conversation (R114 (7), M17
 * I13e), as whoever is in that conversation may play it: the parts the sharer could play, by the
 * share's own addresses; `recording` null, or `deleted`, once it's gone (the share goes with it).
 */
export interface RecordingShareResponse {
  recording: CallRecordingView | null;
  /** When the call was. */
  callAt: string;
}

/** `POST /calls/:id/recording/parts`: the part begun, to send its pieces to. */
export interface CallRecordingPartResponse {
  partId: string;
}

/** A piece of a part kept: how many bytes of it the server has. */
export interface CallRecordingPieceResponse {
  offset: number;
}

/** A frame of a shown screen (M17 I13h): kept, or null when it came too soon or past the part's most. */
export interface CallRecordingFrameResponse {
  frameId: string | null;
}

/** What the notes' routes answer with: how they stand now. */
export interface CallNotesStateResponse {
  notes: CallNotesView | null;
}

/** Someone in a call, as the viewer may see them. */
export interface CallPersonView {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A call in a group conversation (PRD §47): who's in it, and on which device. */
export interface GroupCallView {
  id: string;
  conversationId: string;
  /** The group's name, for the call screen. */
  conversationTitle: string | null;
  kind: CallKind;
  /** Ringing until a second person joins; active while two or more are in it. */
  state: CallState;
  /** Goes up with every change to who's in it: a view with a lower one is older news. */
  rev: number;
  outcome: CallOutcome | null;
  startedBy: CallPersonView;
  /**
   * Who's in it (joined), and the viewer's own place in it: never who else was rung, turned it
   * down or missed it, nor whether anyone still is.
   */
  members: Array<{
    person: CallPersonView;
    state: GroupCallMemberState;
    /**
     * The device they're in it on, while they are, shown only to someone in it too: signals go
     * only between these.
     */
    device: string | null;
    joinedAt: string | null;
  }>;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  /** Cai taking notes in it (M16 F7): to the whole conversation, so its banner offers both joins. */
  notes: CallNotesView | null;
}

/** A group call's signal says whose device it's from too: it's that device of that person. */
export interface GroupCallSignalView extends CallSignalView {
  fromUser: string;
}

/** One call in someone's history (PRD §47): a 1:1 or a group call, as it went for them. */
export interface CallHistoryItem {
  id: string;
  conversationId: string;
  /** The group's name, for a group call. */
  conversationTitle: string | null;
  kind: CallKind;
  group: boolean;
  /** They called, or were called. */
  direction: 'outgoing' | 'incoming';
  result: CallResult;
  /**
   * Who else: the other person, or those in the group call with them; for a group call nobody
   * else joined, whoever started it (none, to them).
   */
  with: CallPersonView[];
  /** How long it lasted, if it was answered. */
  seconds: number;
  createdAt: string;
  endedAt: string | null;
}

export interface CallHistoryResponse {
  calls: CallHistoryItem[];
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null;
}

/**
 * A device that reads private conversations (R18), as anyone writing to it gets it: its keys,
 * and who vouched for it (the device of the same person that approved it, or itself, the first).
 */
export interface DeviceView {
  id: string;
  userId: string;
  encryptionKey: PublicJwk;
  signingKey: PublicJwk;
  introducedBy: string | null;
  introduction: string;
}

/** A private conversation's devices, to seal for, and the chains that vouch for them. */
export interface ConversationDevicesView {
  /** Who's in it now. */
  people: string[];
  /** Everyone's devices that read it now (approved, signed in). */
  devices: DeviceView[];
  /** Devices asked for by id (past senders), and every device that introduced one listed. */
  chain: DeviceView[];
}

/** One of my own devices, for Settings: which it is, when it was added, and if it's approved. */
export interface MyDeviceView extends DeviceView {
  name: string | null;
  /** This is the device asking. */
  current: boolean;
  createdAt: string;
  /** Approved by one of my devices (or the first): until then nothing is sealed for it. */
  approved: boolean;
  /**
   * The device my recovery key stands for (R41): never signed in, sealed for like the others, and
   * what a new device restores from when every other is lost.
   */
  recovery: boolean;
}

/** How two devices reach each other (WebRTC), passed from one to the other. */
export interface CallSignalView {
  callId: string;
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'candidate';
  sdp: string | null;
  candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
    usernameFragment: string | null;
  } | null;
}

/** Where a device finds its way to the other: STUN, and a relay when one is set up. */
export interface IceConfigView {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  relay: boolean;
}

// --- Responses (convention 5) ---------------------------------------------------------------
// Every route's answer has a name here: the server annotates the route with it and the app
// reads it, so a shape that changes fails to compile on both sides. A `…View` is a thing; a
// `…Response` is what a route wraps it in.

export interface OkResponse {
  ok: true;
}
export interface IdResponse {
  id: string;
}
export interface UrlResponse {
  url: string;
}
/**
 * An organization's own checkout (R65), as its owner and admins see it: whether this Caime can
 * connect one, and the account connected (its last four, never a key).
 */
export interface OrgCheckoutView {
  available: boolean;
  connected: {
    provider: 'stripe';
    account: string;
    /** Stripe says it can take payments now (its owner finished Stripe's own setup). */
    chargesEnabled: boolean;
    /** Real money; false for a test account. */
    live: boolean;
    connectedAt: string;
  } | null;
}
export interface OrgCheckoutResponse {
  checkout: OrgCheckoutView;
}
/** What a Pay card's checkout is now, as Stripe says, with the card as it stands. */
export interface CheckoutSettledResponse {
  status: 'paid' | 'open' | 'expired' | 'none';
  message: MessageView;
}
export interface HealthResponse {
  ok: boolean;
  /** The commit this build is (`CAIME_VERSION`), or `unknown` for a build made without it. */
  version: string;
}

export interface UserResponse {
  user: MeView;
}
/** `GET /me` to a token acting as a person (PRD §74): who it acts for, nothing more. */
export interface GrantUserView {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  timeZone: string;
  locale: string;
}
export type MeResponse = UserResponse | { user: GrantUserView };
export interface PrivacyResponse {
  privacy: MeView['privacy'];
}
/**
 * The handles a name could have, best first and each free now (docs/HANDLES.md): what sign-up
 * and a new organization offer. `needsLatinName` when the name is in a script the engine never
 * guesses at; the form asks for its Latin spelling.
 */
export interface HandleCandidatesResponse {
  candidates: string[];
  needsLatinName: boolean;
  policyVersion: number;
  /**
   * An organization's: the best of its handles that a closed, verified organization holds, which
   * proving its domain again takes back (R42). The form offers that before anything else.
   */
  reclaimable?: { handle: string; closedOrg: ClosedOrgView };
}
export interface HandleAvailabilityResponse {
  available: boolean;
  reason: string | null;
  suggestion: string | null;
  /** A closed organization's, verified: proving its domain again takes it back (R42). */
  closedOrg?: ClosedOrgView;
}
export interface SessionsResponse {
  sessions: DeviceSessionView[];
}
export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}

/**
 * A passkey on the account (R36): the name it was given and when it was made and last used,
 * never a key. `synced` says the person's password manager keeps it on their other devices too.
 */
export interface PasskeyView {
  id: string;
  name: string | null;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface PasskeysResponse {
  passkeys: PasskeyView[];
}

export interface PasskeyResponse {
  passkey: PasskeyView;
}

/**
 * A passkey ceremony to run in the browser: WebAuthn's options in their JSON form (binary fields
 * as base64url, as `PublicKeyCredential.parseCreationOptionsFromJSON` and its `…Request…` twin
 * take them), and the challenge's id to answer with.
 */
export interface PasskeyCeremonyResponse {
  challengeId: string;
  options: Record<string, unknown>;
}

/**
 * Signing in with a passkey: WebAuthn's options in their JSON form. Their challenge is signed by
 * the server and carries its deadline, so the answer needs nothing else to be checked.
 */
export interface PasskeySignInOptionsResponse {
  options: Record<string, unknown>;
}
export interface RecoverResponse extends AuthResponse {
  recoveryCodesLeft: number;
}
export interface PersonInsightsResponse {
  insights: PersonInsightsView;
}

export interface PeopleSearchResponse {
  results: PeopleSearchResult[];
}
export interface RelationshipResponse {
  relationship: RelationshipView;
}
export interface SpheresResponse {
  spheres: Array<{ id: Sphere; label: string; roles: Array<{ id: string; label: string }> }>;
}
export interface ConnectionsResponse {
  connections: ConnectionView[];
}
export interface ConnectionRequestsResponse {
  requests: ConnectionRequestView[];
}
/** Asking to connect: connected at once when they had asked me, else a request to them. */
export interface ConnectResponse {
  status: 'connected' | 'requested';
  requestId?: string;
  connectionId?: string;
  conversationId?: string;
  relationship?: RelationshipView | null;
}
export interface RequestAcceptedResponse {
  status: 'connected';
  connectionId: string;
  conversationId: string;
  relationship: RelationshipView | null;
}
export interface InvitesResponse {
  invites: InviteView[];
}
export interface InviteResponse {
  invite: InviteView;
}
export interface InviteOpenResponse {
  invite: InviteOpenView;
}
export interface BlocksResponse {
  blocked: Array<{ id: string; displayName: string; handle: string; since: string }>;
  orgs: Array<{ id: string; name: string; handle: string; since: string }>;
}
export interface ReportedResponse {
  ok: true;
  message: string;
}

export interface ConversationResponse {
  conversation: ConversationView;
  /** A group just made: whom it asked rather than put in (M16 B4). */
  invited?: string[];
}
export interface ConversationIdResponse {
  conversationId: string;
}
/** A link's page for the composer, before it's sent (M16 E4c); null when it says nothing. */
export interface LinkPreviewResponse {
  preview: LinkPreviewView | null;
}

export interface MessageResponse {
  message: MessageView;
}
export interface MessagesResponse {
  messages: MessageView[];
}
export interface MessageIdsResponse {
  messageIds: string[];
}
export interface AlbumResponse {
  photos: AlbumPhotoView[];
}
export interface CustomKitsResponse {
  kits: CustomKitOfferView[];
}
export interface PersonConversationsResponse {
  conversations: Array<{
    id: string;
    title: string | null;
    isGeneral: boolean;
    lastMessageAt: string | null;
  }>;
}
export interface FileResponse {
  file: FileView;
}
export interface UploadStartResponse {
  id: string;
  offset: number;
}
export interface UploadChunkResponse {
  id: string;
  offset: number;
  complete: boolean;
  file?: FileView;
}

export interface TaskResponse {
  task: TaskView;
}
export interface DecisionsResponse {
  decisions: DecisionView[];
}
export interface SuggestionsResponse {
  suggestions: SuggestionView[];
}
export interface SuggestionAcceptedResponse {
  accepted: { type: string; id: string; view?: unknown };
}
export interface ContextView {
  id: string;
  kind: string;
  title: string;
  purpose: string | null;
  status: string;
  deadlineAt: string | null;
  externalRef: string | null;
}
export interface ContextsResponse {
  contexts: ContextView[];
}
export interface ContextResponse {
  context: ContextView;
  conversations: Array<{
    id: string;
    title: string | null;
    kind: ConversationKind;
    lastMessageAt: string | null;
  }>;
  counts: { files: number; decisions: number; openActions: number };
}
export interface CalendarFeedResponse {
  feed: CalendarFeedView;
}
export interface CalendarFeedCreatedResponse extends CalendarFeedResponse {
  url: string;
}

export interface PoliciesResponse {
  policies: PolicyView[];
}
export interface PolicyCreatedResponse {
  id: string;
  existing?: true;
}
export interface EffectivePolicyResponse {
  policy: EffectivePolicy;
  description: string;
  /** What applies to them without a rule of their own. */
  inherited: EffectivePolicy;
}
export interface AutomationsResponse {
  automations: AutomationView[];
}
export interface SavedResponse {
  id: string;
  collection: string;
  existing?: true;
}
export interface CollectionRenamedResponse {
  ok: true;
  collection: string;
}
/**
 * Links to Caime that open the installed app rather than the browser (R35): a person's page
 * (`/@handle`), an organization's (its door, items and collections), a conversation, an invite, a
 * space and a profile. The site's pages, the API and files stay in the browser. The server lists
 * them in `apple-app-site-association` and the app's Android intent filters carry the same ones
 * (`app.config.ts`, held to this list by `appLinks.test.ts`).
 */
export const APP_LINK_PREFIXES = [
  '/@',
  '/o/',
  '/c/',
  '/i/',
  '/t/',
  '/g/',
  '/s/',
  '/p/',
  '/m/',
] as const;

/** The phone apps' ids, as `app.json` names them (held to it by `appLinks.test.ts`). */
export const APP_IDS = { ios: 'me.cai.app', android: 'me.cai.app' } as const;
/** The phone apps' own scheme (`caime://`), as `app.json` names it: where an account returns. */
export const APP_SCHEME = 'caime';

export interface PushKeyResponse {
  publicKey: string;
}

/**
 * A phone's notification channels (Android; iOS reads the sound alone): the server names one on
 * each push, the app makes both. Anything that asks for them rings; an activity line is quiet.
 */
export const PUSH_CHANNELS = { alert: 'messages', quiet: 'quiet' } as const;

export interface SpacesResponse {
  spaces: SpaceSummaryView[];
}
export interface SpaceResponse {
  space: SpaceView;
  /** A space just made: whom it asked rather than put in (M16 B4). */
  invited?: string[];
}
export interface OrgsResponse {
  orgs: OrgSummaryView[];
}
export interface OrgResponse {
  org: OrgView;
}
export interface OrgSpacesResponse {
  spaces: OrgSpaceView[];
}
export interface OrgPlanResponse {
  plan: OrgPlanView;
}
export interface PlanUsageResponse {
  plan: PlanUsageView;
}
export interface ErasedResponse {
  erased: number;
}
export interface OrgConversationResponse {
  conversationId: string;
  created: boolean;
}
export interface ThreadResponse {
  thread: BusinessThreadView;
}
export interface OrgAgentResponse {
  available: boolean;
  agent: OrgAgentView | null;
}
export interface OrgAgentSetResponse {
  agent: OrgAgentView;
}
export interface OrgAppsResponse {
  apps: OrgAppView[];
}
export interface OrgAppResponse {
  app: OrgAppView;
}
export interface OrgInsightsResponse {
  insights: OrgInsightsView;
}
export interface DeliveriesResponse {
  deliveries: WebhookDeliveryView[];
}
export interface DeliveryResponse {
  delivery: WebhookDeliveryView;
}
export interface DeliveryQueuedResponse {
  deliveryId: string;
}
/** A host's bookings as set (R58): its hours, or null for none, and its catalog. */
export interface BookingResponse {
  booking: BookingHours | null;
  items: BookingItem[];
  /** How the host takes orders (R60), or null for none. */
  ordering: OrderingSettings | null;
  /** Its collections (R61). */
  collections: CatalogCollection[];
  /** How it's paid (R62), or null: its own, never shown to anyone else as it is. */
  payments: PaymentSettings | null;
}
/**
 * What a host saves (`PUT /orgs/:id/booking`, `/me/booking`): the offer, each item's count only
 * where it was changed (R60): a number sets it, null stops counting, left out keeps it, since an
 * order may have taken one since the offer was read.
 */
export interface BookingSaveBody extends Omit<BookingResponse, 'items'> {
  items: Array<Omit<BookingItem, 'stock'> & { stock?: number | null }>;
}
export interface OrgUpdateResponse {
  update: OrgUpdateView;
}
export interface FollowResponse {
  following: { notify: boolean };
}
export interface FollowingResponse {
  following: FollowingView[];
}
export interface AppKitsResponse {
  kits: AppKitView[];
}
export interface AppKitResponse {
  kit: AppKitView;
}

export interface PersonalTokensResponse {
  tokens: PersonalTokenView[];
}

/**
 * The API as a document (R79, R78): OpenAPI 3.1, written from the same schemas the routes parse
 * with, for the token-reachable routes (`API_ROUTES`, `PERSON_ROUTES`), so an automation
 * platform or an agent framework imports Caime rather than hand-writing it. Served at
 * `GET /v1/openapi.json` to anyone; it says nothing a signed-in person doesn't already read in
 * `docs/API.md`.
 */
export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    securitySchemes: Record<string, { type: 'http'; scheme: 'bearer'; description: string }>;
    schemas: Record<string, unknown>;
  };
}
export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  security: Array<Record<string, string[]>>;
  parameters: Array<{
    name: string;
    in: 'path' | 'query';
    required: boolean;
    schema: unknown;
    description?: string;
  }>;
  requestBody?: { required: true; content: { 'application/json': { schema: unknown } } };
  responses: Record<string, { description: string; content?: Record<string, { schema: unknown }> }>;
}
export interface PersonalTokenCreatedResponse {
  token: string;
  view: PersonalTokenView;
}
export interface OAuthAppsResponse {
  apps: OAuthAppView[];
}
export interface OAuthAppResponse {
  app: OAuthAppView;
}
export interface OAuthAppCreatedResponse {
  app: OAuthAppView;
  clientSecret: string | null;
}
export interface OAuthRedirectResponse {
  redirect: string;
}
export interface ConnectedAppsResponse {
  apps: ConnectedAppView[];
}
/** RFC 6749 §5.1: the token endpoint's answer, in the RFC's own names. */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}
/** RFC 6749 §5.2: a token or revocation endpoint's refusal, in the RFC's own names. */
export interface OAuthErrorResponse {
  error: string;
  error_description: string;
}
/** RFC 8414: where an app finds the endpoints. */
export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint_auth_methods_supported: string[];
  /** RFC 9207: the authorization response names its issuer (`iss`). */
  authorization_response_iss_parameter_supported: boolean;
  scopes_supported: string[];
}

export interface CallResponse {
  call: CallView;
}
export interface GroupCallResponse {
  call: GroupCallView;
}
export interface GroupCallMaybeResponse {
  call: GroupCallView | null;
}
export interface LiveCallsResponse {
  call: CallView | null;
  groupCall?: GroupCallView | null;
}
export interface DeviceResponse {
  device: MyDeviceView;
}
export interface MyDevicesResponse {
  devices: MyDeviceView[];
  chain: DeviceView[];
}
export interface DeviceRemovedResponse {
  ok: true;
  signedOut: boolean;
}

export interface ReportsResponse {
  reports: ReportView[];
}
/** A suspended account's appeal (M16 B6), as the operator reads it. */
export interface AppealView {
  id: string;
  person: { id: string; handle: string; displayName: string; suspended: boolean };
  /** What the operator recorded when suspending them, as they were shown it. */
  reason: string | null;
  body: string;
  createdAt: string;
  decidedAt: string | null;
  outcome: 'lifted' | 'upheld' | null;
  note: string | null;
}
export interface AppealsResponse {
  appeals: AppealView[];
}
export interface AppealResponse {
  appeal: AppealView;
}
/** An appeal sent from a suspended sign-in (M16 B6): `already` when one was waiting. */
export interface AppealSentResponse {
  ok: true;
  already: boolean;
}

/** A check of one's age begun (M16 B7): the provider's page to open, for this check alone. */
export interface AgeCheckStartResponse {
  url: string;
}
/** A person's export (lib/export.ts) as the file holds it: its shape is the file's. */
export type AccountExportFile = Record<string, unknown>;
/** What a suspended account's sign-in refusal carries (M16 B6), on `ApiError.details`. */
export interface SuspendedDetails {
  /** The operator's reason, as they recorded it. */
  reason: string | null;
  /** Opens the appeal and the export for thirty minutes, after a proof of the password. */
  claim: string | null;
}
export interface ReportResponse {
  report: ReportView;
}
export interface ProductMetricsResponse {
  metrics: ProductMetricsView;
}
/** A database dump (docs/DEPLOY.md): on the volume, and copied off the host when a bucket is set. */
export interface BackupView {
  file: string;
  bytes: number;
  at: string;
  copy?: string | null;
  /** Encrypted with BACKUP_KEY (`….dump.enc`, M16 B5). */
  encrypted?: boolean;
}
export interface BackupsResponse {
  enabled: boolean;
  /** Whether new backups are encrypted (BACKUP_KEY is set). */
  encrypts: boolean;
  dir: string;
  keepDays: number;
  last: BackupView | null;
  files: BackupView[];
}
/** A background job the operator may need to see: dead (out of attempts) or failing. Never its payload. */
export interface AdminJobView {
  id: string;
  kind: string;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  deadAt: string | null;
  lastError: string | null;
  createdAt: string;
}
export interface AdminJobsResponse {
  jobs: AdminJobView[];
  /** How many are dead in all. */
  dead: number;
}
/**
 * A connected account that isn't working, for the operator (M16 G4): facts to help with, never
 * its address, what it read or what it wrote.
 */
export interface AdminConnectionView {
  id: string;
  provider: AccountProvider;
  /** Whose, to look them up with `/admin/people/:handle`. */
  handle: string;
  uses: AccountUse[];
  state: AccountState;
  createdAt: string;
  read: AccountUseHealthView | null;
  plans: AccountUseHealthView | null;
  /** Until when the provider asked Caime to wait, if it did. */
  restUntil: string | null;
}
export interface AdminConnectionsResponse {
  /** Every connection's uses by how they last went, as `/metrics` counts them. */
  counts: Array<{
    use: AccountRunningUse;
    health: 'working' | 'failing' | 'reconnect';
    count: number;
  }>;
  /** Plans refused on their own and waiting for their card to change, across every connection. */
  stuck: number;
  /** The connections not working, the latest failure first, at most a hundred. */
  failing: AdminConnectionView[];
}
export interface BackupResponse {
  backup: BackupView;
}
/** The audit log's hash chain, verified over its newest rows (R78, docs/SECURITY.md). */
export interface AuditChainView {
  checked: number;
  firstSeq: number | null;
  lastSeq: number | null;
  /** The newest row's hash: note it, and a later check shows whether the chain was rewritten. */
  head: string | null;
  /** Rows whose hash no longer matches their fields. */
  altered: number[];
  /** Rows whose link doesn't match the row before them. */
  broken: number[];
  ok: boolean;
}
export interface AuditChainResponse {
  chain: AuditChainView;
}
/** A configured provider as its last probe found it (R78): null until one ran. */
export interface ProviderHealthView {
  id: string;
  name: string;
  up: boolean | null;
  latencyMs: number | null;
  checkedAt: string | null;
  /** What the failure said, clipped, never a key. */
  error: string | null;
}
export interface ProvidersResponse {
  providers: ProviderHealthView[];
}
/** What the operator sees of someone locked out: facts, never content or an address. */
export interface AdminPersonResponse {
  person: {
    id: string;
    handle: string;
    displayName: string;
    plan: string;
    createdAt: string;
    lastActiveAt: string | null;
    emailConfirmed: boolean;
    suspended: boolean;
    suspendedReason: string | null;
    sessions: Array<{
      id: string;
      kind: string;
      platform: string | null;
      deviceName: string | null;
      createdAt: string;
      lastSeenAt: string;
    }>;
    privateDevices: number;
    personalTokens: number;
    appGrants: number;
    recoveryCodesLeft: number;
    organizations: Array<{ handle: string; role: string }>;
  };
}

/** `POST /v1/messages/:id/guests` (R84): the meeting's own space, and its card there. */
export interface MeetingGuestResponse {
  space: { conversationId: string; messageId: string };
  /**
   * A guest by link's own link (review 2026-10-17 §1 H6), shown this once to send however the
   * inviter likes; null for a guest by address, whose link goes by mail.
   */
  link: string | null;
}

/** One side of a receipt (R62): a person, or an organization with its verified domain. */
export interface ReceiptParty {
  name: string;
  handle: string | null;
  /** An organization's domain, once it proved it (R42). */
  domain: string | null;
}

/**
 * A paid Pay card's receipt (R62, R65): what was paid, to whom and by whom, when, and how. A
 * record both sides agreed on, not a tax invoice; to a customer, the team is its organization.
 */
export interface ReceiptView {
  /** From the card's own id: the same every time (`receiptNumber`). */
  number: string;
  messageId: string;
  conversationId: string;
  paidAt: string;
  amount: { value: number; currency: string | null };
  note: string | null;
  payee: ReceiptParty;
  /** Who paid, when it's known (a group's ask marked received unasked isn't). */
  payer: ReceiptParty | null;
  /** By card through the organization's own checkout, or confirmed received by the payee. */
  how: 'card' | 'confirmed';
}

/** `GET /v1/messages/:id/receipt`. */
export interface ReceiptResponse {
  receipt: ReceiptView;
}

/** `GET /v1/join/:token` (R84): a guest's link, before they take it. */
export interface JoinView {
  meeting: {
    title: string;
    at: string;
    durationMinutes: number;
    host: string | null;
    /** It says Cai takes notes in its call (M16 F7c): told before joining, asked as they join. */
    notes: boolean;
    /**
     * Its call is the guest's one-to-one with whoever it's with (M16 F6c: a page's booker, or
     * whoever a card held on Caime was mailed to), not a meeting space's group call.
     */
    direct: boolean;
    /** An appointment, a booking among them, rather than a meeting. */
    booking: boolean;
  };
  /** Their name, and what they said of their age before (as they booked), if they did. */
  guest: { name: string; adult: boolean | null };
  /** The address is someone's on Caime: they sign in instead, and find it among their requests. */
  signIn: boolean;
  /**
   * Where the meeting is, only to the guest it's for once they've taken the link (their own
   * session): the page opens their meeting rather than asking again.
   */
  space: { conversationId: string; messageId: string; seq: number } | null;
}

/** `POST /v1/join/:token`: the meeting's space and card, and a phone's session token. */
export interface JoinResponse {
  conversationId: string;
  messageId: string;
  seq: number;
  token?: string;
}

/**
 * `POST /v1/guest/keep` (M16 C3f): what a guest's page takes to sign-up to keep their meeting:
 * their name, and the address their invitation came to (proven there by its code at sign-up),
 * or, for a guest by link, who has none, a claim naming them that sign-up takes for half an hour.
 */
export interface GuestKeepResponse {
  name: string;
  email: string | null;
  claim: string | null;
}
