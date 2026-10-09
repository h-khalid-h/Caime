/**
 * API request contracts (docs/ARCHITECTURE.md, "API conventions"). The server validates every
 * body with these; clients use the same schemas for forms, so a rule changes in one place.
 */
import { z } from 'zod';
import { PERSONAL_SCOPES, redirectUriError } from './access';
import { AGENT_KNOWLEDGE_MAX, AGENT_NAME_MAX } from './agents';
import { MARKETING_PAGES, SITE_PAGES } from './api';
import { API_SCOPES, WEBHOOK_EVENTS } from './apps';
import { ARABIC_VARIETIES } from './arabic-variety';
import { REWRITE_STYLES } from './assist';
import { COLLECTION_MAX, SAVE_KINDS, WORD_MAX, WORDS_MAX } from './automations';
import { BILLED_PLANS, BILLING_INTERVALS } from './billing';
import {
  BOOKING_CAPACITY_MAX,
  BOOKING_DAYS_MAX,
  BOOKING_ITEMS_MAX,
  ORDER_LINES_MAX,
} from './booking';
import { CALL_KINDS } from './calls';
import { COLLECTIONS_MAX, SLUG_MAX, slugError } from './catalog';
import { isPublicKey, isSealed, isSignature, type PublicJwk, type SealedMessage } from './e2ee';
import { isEmoji } from './emoji';
import { msg } from './i18n';
import { IMPORT_MAX_MESSAGES, IMPORT_MAX_TEXT } from './imports';
import { latestFoundedYear, ORG_KINDS, UPDATE_MAX } from './orgs';
import { PAYMENT_KINDS, PAYMENT_METHODS_MAX, paymentUrlError } from './payments';
import { AI_TONES, NOTIFY_MODES, PRIORITIES, PRIVACY_PRESETS } from './policy';
import { PRIVACY_FIELDS } from './privacy';
import {
  HANDLE_PATTERN,
  HANDLE_REPEAT_RULE,
  HANDLE_RULE,
  normalizeHandle,
  PASSWORD_MIN,
} from './rules';
import { SPACE_KINDS } from './spaces';
import { SPHERES } from './taxonomy';

/**
 * A handle as it's kept (lowercase). A reserved one passes here: the server refuses it where it
 * refuses a taken one (isReservedHandle, below), and the operator can give it out.
 */
export const Handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(HANDLE_PATTERN, HANDLE_RULE)
  .refine((h) => !/[._]{2}/.test(h), HANDLE_REPEAT_RULE);

/**
 * Handles nobody can take (R35). `cai.me/@handle` is everyone's link, so a handle that reads as
 * Caime, one of its characters, the people who run it or one of its own pages would let an
 * account pose as the product. The server refuses these in the words it uses for a taken handle,
 * so the answers don't tell the two apart; only the operator gives one out (`/v1/admin`).
 */
export const RESERVED_HANDLES: readonly string[] = [
  // The server's own paths at the root, answered before any page.
  'healthz',
  'readyz',
  // The product, by every name it has had. Caishy is also the first of its characters.
  'caime',
  'caishy',
  'conniqt',
  'cai',
  // Its other characters (BRAND.md): they speak in its welcome, empty states and stickers.
  'momo',
  'panda',
  'lumi',
  'pico',
  'niko',
  'zuzu',
  // Whoever runs it, and whatever speaks for it.
  'admin',
  'administrator',
  'root',
  'system',
  'sysadmin',
  'superuser',
  'operator',
  'moderator',
  'moderation',
  'mod',
  'staff',
  'team',
  'official',
  'verified',
  'verify',
  'verification',
  'support',
  'help',
  'helpdesk',
  'contact',
  'hello',
  'info',
  'feedback',
  'security',
  'safety',
  'trust',
  'abuse',
  'legal',
  'compliance',
  'copyright',
  'report',
  'reports',
  'noreply',
  'no.reply',
  'no_reply',
  'donotreply',
  'notification',
  'notify',
  'alert',
  'alerts',
  'news',
  'newsletter',
  'mail',
  'email',
  'mailer',
  'postmaster',
  'hostmaster',
  'webmaster',
  'bot',
  'bots',
  'agent',
  'assistant',
  'billing',
  'payment',
  'payments',
  'pay',
  'wallet',
  'account',
  'accounts',
  'login',
  'logout',
  'signin',
  'signup',
  'register',
  'password',
  'recovery',
  // Where it lives: the web, the API, the apps.
  'api',
  'www',
  'app',
  'apps',
  'web',
  'ios',
  'android',
  'status',
  'blog',
  'docs',
  'developer',
  'developers',
  'auth',
  'oauth',
  'assets',
  'static',
  'files',
  'metrics',
  // Its own pages, the app's top-level screens and the files at the web's root, so a link to
  // someone never reads as one (apps/app's paths.test.ts checks every route is here).
  ...SITE_PAGES,
  ...MARKETING_PAGES,
  'about',
  'settings',
  'chats',
  'people',
  'spaces',
  'actions',
  'you',
  'calls',
  'connect',
  'search',
  // The invite route is /i/<token>: too short to be a handle, so it needs no reserving.
  'invite',
  'invites',
  'requests',
  'notifications',
  'updates',
  'orgs',
  'onboarding',
  'welcome',
  'recover',
  'forgot',
  'reset',
  'sw.js',
  'index.html',
  'favicon.ico',
  'favicon.svg',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'fonts',
];

/**
 * The product's names, which no handle may carry even among other words (@caime.support,
 * @the_caime, @caime2, @cai.me). Not "cai": it's people's name too (a Welsh given name, a common
 * Chinese surname: R34), so only @cai itself is kept.
 */
const PRODUCT_NAMES = new Set(['caime', 'caishy', 'conniqt']);
const RESERVED = new Set(RESERVED_HANDLES);
/** What a product name can be run together with and still read as the product. */
const ALONGSIDE = [
  ...PRODUCT_NAMES,
  ...RESERVED_HANDLES,
  ...['the', 'real', 'get', 'try', 'join', 'use', 'my', 'hey', 'hi', 'hq', 'inc', 'ai', 'co', 'io'],
];

/**
 * Whether nobody but the operator may take `handle`: it's one of RESERVED_HANDLES, or it carries
 * one of the product's names as a word of its own (between dots, underscores or digits), or reads
 * as one once those are dropped (@cai.me), alone or run together with reserved words only
 * (@caimesupport, @officialcaime). A name inside some other word stays free: @caimei is Cai Mei.
 */
export function isReservedHandle(handle: string): boolean {
  const h = normalizeHandle(handle);
  if (RESERVED.has(h)) return true;
  const words = h.split(/[._\d]+/).filter(Boolean);
  return [...words, words.join('')].some(readsAsProduct);
}

/** Whether `text` is a product name, alone or run together with others of ALONGSIDE only. */
function readsAsProduct(text: string): boolean {
  // How the first i letters read: 0 not as known words, 1 as words without a product name, 2 with.
  const read = new Array<number>(text.length + 1).fill(0);
  read[0] = 1;
  for (let i = 0; i < text.length; i++) {
    if (!read[i]) continue;
    for (const word of ALONGSIDE) {
      if (!text.startsWith(word, i)) continue;
      const end = i + word.length;
      read[end] = Math.max(read[end]!, PRODUCT_NAMES.has(word) ? 2 : read[i]!);
    }
  }
  return read[text.length] === 2;
}

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .email(msg('Enter a valid email address.'))
  .max(254);

export const Password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(200, msg('That password is too long.'))
  .refine((p) => new Set(p).size >= 5, msg('Use a less repetitive password.'));

export const DisplayName = z.string().trim().min(1, msg('Enter your name.')).max(80);

const TimeZone = z.string().min(1).max(64);
/** A day of the calendar as it's kept, 'YYYY-MM-DD' (whether it's a real one is checked where it's used). */
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Enter a date like 1990-05-17.'));
/** A country or territory by its ISO 3166-1 code (the server checks it's one: lib/geo.ts). */
const Country = z.string().regex(/^[A-Z]{2}$/, msg('Choose a country.'));
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, msg('Use HH:MM.'));
export const ScheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start: HHMM,
  end: HHMM,
});

export const SphereSchema = z.enum(SPHERES);

// --- Auth ------------------------------------------------------------------------------------

export const SignupBody = z.object({
  email: Email,
  password: Password,
  displayName: DisplayName,
  handle: Handle,
  /** 'YYYY-MM-DD': only for their age (R29), never shown to anyone. */
  birthDate: Day,
  /** Where they live (ISO 3166-1), which sets their defaults. */
  country: Country,
  timeZone: TimeZone.optional(),
  locale: z.string().max(35).optional(),
  client: z.enum(['web', 'native']).default('web'),
  deviceName: z.string().max(80).optional(),
  /** The @handle whose link brought them here, a person's or an organization's (PRD §82). */
  invite: z.string().max(200).optional(),
});

/**
 * How a search ended (PRD §83, information retrieval): whether something was opened, and how
 * long after the first letter. Nothing about what was searched for, or found.
 */
export const SearchOutcomeBody = z
  .object({ found: z.boolean(), ms: z.number().int().min(0).max(3_600_000) })
  .strict();

/** A personal access token: what it's for, what it may do, and for how long (days; null: until revoked). */
export const CreatePersonalTokenBody = z
  .object({
    name: z.string().trim().min(1, msg('Name it for what will use it.')).max(60),
    scopes: z.array(z.enum(PERSONAL_SCOPES)).min(1, msg('Choose what it may do.')).max(10),
    days: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
  })
  .strict();

/** A third-party app a developer registers: where people come back to after allowing it. */
export const CreateOAuthAppBody = z
  .object({
    name: z.string().trim().min(1, msg('Name your app.')).max(60),
    website: z.string().trim().url().max(300).optional(),
    redirectUris: z
      .array(
        z
          .string()
          .trim()
          .max(500)
          .superRefine((uri, ctx) => {
            const error = redirectUriError(uri);
            if (error) ctx.addIssue({ code: 'custom', message: error });
          }),
      )
      .min(1, msg('Add where people come back to after allowing it.'))
      .max(5),
    confidential: z.boolean().default(false),
  })
  .strict();

/** The device a call rings or runs on: each tab or app picks one when it starts. */
const CallDevice = z.string().regex(/^[\w-]{8,64}$/, msg('Which device is this?'));

/** Call someone in a direct conversation (PRD §47). */
export const StartCallBody = z.object({ kind: z.enum(CALL_KINDS), deviceId: CallDevice }).strict();

/** Answer, on this device. */
export const CallDeviceBody = z.object({ deviceId: CallDevice }).strict();

/** How this device can be reached (WebRTC), for the other side's device. */
export const CallSignalBody = z
  .object({
    deviceId: CallDevice,
    kind: z.enum(['offer', 'answer', 'candidate']),
    sdp: z.string().max(20_000).optional(),
    candidate: z
      .object({
        candidate: z.string().max(1000),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => (b.kind === 'candidate' ? Boolean(b.candidate) : Boolean(b.sdp)), {
    message: msg('Send an SDP with an offer or answer, and a candidate with a candidate.'),
  });

/** How this device reaches one other device in a group call: `to`, of the person `toUser`. */
export const GroupCallSignalBody = z
  .object({
    deviceId: CallDevice,
    to: CallDevice,
    toUser: z.string().uuid(),
    kind: z.enum(['offer', 'answer', 'candidate']),
    sdp: z.string().max(20_000).optional(),
    candidate: z
      .object({
        candidate: z.string().max(1000),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => (b.kind === 'candidate' ? Boolean(b.candidate) : Boolean(b.sdp)), {
    message: msg('Send an SDP with an offer or answer, and a candidate with a candidate.'),
  });

/** An organization's AI agent: its name and what it answers from (PRD §75). */
export const SetOrgAgentBody = z
  .object({
    name: z.string().trim().min(1, msg('Name it.')).max(AGENT_NAME_MAX),
    knowledge: z
      .string()
      .trim()
      .min(20, msg('Tell it what customers ask about: hours, services, prices, how to book.'))
      .max(AGENT_KNOWLEDGE_MAX),
    paused: z.boolean().default(false),
  })
  .strict();

/** A question to try an AI agent on, with what it would know, before it answers anyone. */
export const TryOrgAgentBody = z
  .object({
    name: z.string().trim().min(1).max(AGENT_NAME_MAX),
    knowledge: z.string().trim().min(1).max(AGENT_KNOWLEDGE_MAX),
    question: z.string().trim().min(1, msg('Ask it something a customer would.')).max(1000),
  })
  .strict();

/** An app asks to act for someone (the authorization request, with PKCE). */
export const OAuthAuthorizeRequest = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1).max(80),
  redirect_uri: z.string().min(1).max(500),
  scope: z.string().max(500).default(''),
  state: z.string().max(500).optional(),
  code_challenge: z.string().regex(/^[\w-]{43,128}$/, msg('A PKCE code challenge is needed.')),
  code_challenge_method: z.literal('S256'),
});

export const LoginBody = z.object({
  identifier: z.string().trim().min(1, msg('Enter your email or handle.')).max(254),
  password: z.string().min(1, msg('Enter your password.')).max(200),
  client: z.enum(['web', 'native']).default('web'),
  deviceName: z.string().max(80).optional(),
});

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: Password,
});

/** The six digits sent to an address (R48). */
export const EmailCodeBody = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, msg('Enter the six digits from the email.'))),
});

export const ResetRequestBody = z.object({ email: Email });

export const ResetConfirmBody = z.object({
  token: z.string().min(20).max(200),
  newPassword: Password,
  client: z.enum(['web', 'native']).default('web'),
});

export const RecoverBody = z.object({
  identifier: z.string().trim().min(1).max(254),
  code: z.string().trim().min(8).max(20),
  newPassword: Password,
  client: z.enum(['web', 'native']).default('web'),
});

// --- Me --------------------------------------------------------------------------------------

export const Preferences = z
  .object({
    bubbleTheme: z.enum(['plum', 'pink', 'lavender', 'sky', 'mint', 'sunshine']).optional(),
    personality: z.enum(['playful', 'minimal']).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    enterToSend: z.boolean().optional(),
    mediaAutoDownload: z.enum(['always', 'wifi', 'never']).optional(),
    reduceMotion: z.boolean().optional(),
    /** In an agreed meeting or appointment, hold work messages until it ends (R51). */
    holdWhileBusy: z.boolean().optional(),
    /** Suggestions follow what this person keeps taking and passing on (M11); on by default. */
    learnFromChoices: z.boolean().optional(),
    /** Cai's morning brief (R68): the hour it comes, in their own time, or off. */
    caiBrief: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    /**
     * How Cai and the Caime Friends speak Arabic (R72): as this person writes and where they
     * live (`auto`), or the one chosen. The interface stays in Standard Arabic.
     */
    arabicVariety: z.enum(['auto', ...ARABIC_VARIETIES]).optional(),
    /** The interface language (R54): the device's, or one chosen. */
    language: z.enum(['auto', 'en', 'ar', 'fr', 'tr']).optional(),
    /**
     * The language the app last showed this person (what `auto` came to on their device), so the
     * server writes to them in it; the last device to open wins when two differ.
     */
    interfaceLanguage: z.enum(['en', 'ar', 'fr', 'tr']).optional(),
  })
  .strict();

export const UpdateMeBody = z
  .object({
    displayName: DisplayName.optional(),
    handle: Handle.optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    pronouns: z.string().trim().max(40).nullable().optional(),
    statusText: z.string().trim().max(80).nullable().optional(),
    // One whole emoji, as the app's picker gives it (emoji.ts).
    statusEmoji: z.string().max(16).refine(isEmoji, msg('Choose an emoji.')).nullable().optional(),
    presence: z.enum(['auto', 'available', 'busy', 'away', 'invisible']).optional(),
    timeZone: TimeZone.optional(),
    locale: z.string().max(35).optional(),
    country: Country.optional(),
    workweek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    quietHours: ScheduleSchema.nullable().optional(),
    preferences: Preferences.optional(),
    aiEnabled: z.boolean().optional(),
    avatarFileId: z.string().uuid().nullable().optional(),
    onboarded: z.boolean().optional(),
    /** Only ever set: once saved, nobody is asked again (R56). */
    recoveryCodesSeen: z.literal(true).optional(),
  })
  .strict();

const AudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('everyone') }),
  z.object({ kind: z.literal('connections') }),
  z.object({ kind: z.literal('spheres'), spheres: z.array(SphereSchema).max(SPHERES.length) }),
  z.object({ kind: z.literal('nobody') }),
]);

export const PrivacyBody = z
  .object({
    // partialRecord: zod 4's z.record with enum keys requires every key.
    fields: z.partialRecord(z.enum(PRIVACY_FIELDS), AudienceSchema).optional(),
    discoverByHandle: z.boolean().optional(),
    discoverByEmail: z.boolean().optional(),
    messageRequests: z.enum(['everyone', 'shared_connections', 'nobody']).optional(),
  })
  .strict();

export const IdentityBody = z.object({
  kind: z.enum(['personal', 'professional', 'organization']),
  displayName: DisplayName,
  headline: z.string().trim().max(120).nullable().optional(),
  orgName: z.string().trim().max(120).nullable().optional(),
  isDefault: z.boolean().optional(),
});

// --- Relationships ---------------------------------------------------------------------------

export const RelationshipInput = z.object({
  sphere: SphereSchema,
  role: z.string().trim().max(60).nullable().optional(),
  /** A custom role in the user's own words (R28). */
  roleLabel: z.string().trim().max(60).nullable().optional(),
  orgName: z.string().trim().max(120).nullable().optional(),
  contextNote: z.string().trim().max(200).nullable().optional(),
  shared: z.boolean().optional(),
});
export type RelationshipInputT = z.infer<typeof RelationshipInput>;

export const ConnectionRequestBody = z.object({
  toUserId: z.string().uuid(),
  note: z.string().trim().max(280).nullable().optional(),
  /** Context shown to the recipient: "Work · DATA C" (PRD §52). */
  context: z
    .object({
      sphere: SphereSchema.nullable().optional(),
      orgName: z.string().trim().max(120).nullable().optional(),
    })
    .optional(),
  /** How I classify them, applied when they accept. Private to me. */
  relationship: RelationshipInput.optional(),
  identityId: z.string().uuid().optional(),
});

export const AcceptRequestBody = z.object({
  relationship: RelationshipInput.optional(),
});

/**
 * An invite link (R1): how the inviter will know whoever joins through it (private, applied
 * the moment they do), whether to show them the context, and a line for them.
 */
export const InviteBody = z.object({
  relationship: RelationshipInput.optional(),
  /** Show whoever opens it "Work · DATA C" (never the private label). */
  showContext: z.boolean().optional(),
  note: z.string().trim().max(280).nullable().optional(),
});

export const UpdateConnectionBody = z
  .object({
    nickname: z.string().trim().max(80).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    attention: z.enum(['auto', 'priority', 'normal', 'quiet']).optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    archived: z.boolean().optional(),
    identityId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const CreateRelationshipBody = RelationshipInput.extend({ userId: z.string().uuid() });
export const ChangeRelationshipBody = RelationshipInput.partial();
export const MergeRelationshipsBody = z.object({
  keepId: z.string().uuid(),
  mergeIds: z.array(z.string().uuid()).min(1).max(20),
});
export const CustomRoleBody = z.object({
  sphere: SphereSchema,
  label: z.string().trim().min(1).max(60),
});

// --- Policies --------------------------------------------------------------------------------

export const PolicySettingsSchema = z
  .object({
    notify: z.enum(NOTIFY_MODES).optional(),
    schedule: ScheduleSchema.nullable().optional(),
    allowUrgent: z.boolean().optional(),
    priority: z.enum(PRIORITIES).optional(),
    priorityInScheduleOnly: z.boolean().optional(),
    aiTone: z.enum(AI_TONES).optional(),
    followUpHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .nullable()
      .optional(),
    privacy: z.enum(PRIVACY_PRESETS).optional(),
  })
  .strict();

export const PolicyBody = z.object({
  name: z.string().trim().max(60).nullable().optional(),
  scope: z
    .object({
      sphere: SphereSchema.nullable().optional(),
      role: z.string().max(60).nullable().optional(),
      orgId: z.string().uuid().nullable().optional(),
      connectionId: z.string().uuid().nullable().optional(),
    })
    .refine(
      (s) => s.sphere || s.connectionId || (!s.role && !s.orgId),
      'A role or organization needs a sphere.',
    ),
  settings: PolicySettingsSchema,
});

// --- Automations and what's saved (PRD §69) ----------------------------------------------------

const CollectionName = z.string().trim().min(1).max(COLLECTION_MAX);

export const AutomationWhenSchema = z
  .object({
    sphere: SphereSchema.nullable().optional(),
    role: z.string().trim().max(60).nullable().optional(),
    kinds: z.array(z.enum(SAVE_KINDS)).min(1).max(SAVE_KINDS.length),
    words: z.array(z.string().trim().min(1).max(WORD_MAX)).max(WORDS_MAX).optional(),
  })
  .refine((w) => !w.role || w.sphere, msg('A role needs a kind of relationship.'));

export const AutomationBody = z.object({
  name: z.string().trim().max(60).nullable().optional(),
  when: AutomationWhenSchema,
  collection: CollectionName,
  enabled: z.boolean().optional(),
});

export const AutomationPatch = AutomationBody.partial();

export const SaveBody = z.object({
  /** Where to keep it; the default collection without one. */
  collection: CollectionName.optional(),
  /** One file or link of the message, rather than all of it. */
  assetId: z.string().uuid().optional(),
});

export const MoveSavedBody = z.object({ collection: CollectionName });

export const RenameCollectionBody = z.object({ from: CollectionName, to: CollectionName });

// --- Suggestions -----------------------------------------------------------------------------

export const AcceptSuggestionBody = z.object({
  /** The user may edit before accepting ("Change", PRD §12). */
  title: z.string().trim().min(1).max(200).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  relationship: RelationshipInput.optional(),
  /** A possible duplicate (PRD §51): which of the two to keep them under. */
  keep: z.string().uuid().optional(),
});
export type AcceptSuggestionEdits = z.infer<typeof AcceptSuggestionBody>;

/** Several steps, one approval (R37): the suggestions of one card, done in this order. */
export const AcceptSuggestionsBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(8),
});

// --- Organizations' updates (PRD §59) ----------------------------------------------------------

export const PostUpdateBody = z.object({
  body: z.string().trim().min(1).max(UPDATE_MAX),
  /** The poster's own id for it: sent again after a lost answer, it's the same update (ADR-8). */
  clientId: z.string().uuid().optional(),
});

export const EditUpdateBody = z.object({
  body: z.string().trim().min(1).max(UPDATE_MAX),
});

export const FollowOrgBody = z.object({
  /** Told of each update (a notification), or only shown them in Updates. */
  notify: z.boolean().optional(),
});

// --- Conversations and messages ----------------------------------------------------------------

export const CreateConversationBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('direct'),
    userId: z.string().uuid(),
    /** A titled topic conversation with the same person (PRD §16). */
    title: z.string().trim().min(1).max(80).optional(),
    contextId: z.string().uuid().optional(),
    /** End to end encrypted (R18): a conversation of its own with the same person. */
    private: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('group'),
    title: z.string().trim().min(1, msg('Name the group.')).max(80),
    purpose: z.string().trim().max(200).optional(),
    memberIds: z.array(z.string().uuid()).min(1, msg('Add at least one person.')).max(255),
    /** End to end encrypted (R18). */
    private: z.boolean().optional(),
  }),
]);

/** A topic started from a conversation (PRD §58): its subject, as its name. */
export const TopicBody = z.object({
  title: z.string().trim().min(1, msg('Name the topic.')).max(80),
});

/**
 * A chat brought over from WhatsApp (R45): read on the device (`@caime/core/whatsapp`), sent as
 * lines already told apart by who wrote them. It lands as a topic of the one-to-one with a
 * person you're connected with; every message says it was imported.
 */
export const ImportChatBody = z.object({
  userId: z.string().uuid(),
  source: z.literal('whatsapp'),
  /** The topic's name; "WhatsApp" if left out. */
  title: z.string().trim().min(1).max(80).optional(),
  messages: z
    .array(
      z.object({
        at: z.string().datetime({ offset: true }),
        /** Written by the person importing (true), or by the other one (false). */
        mine: z.boolean(),
        text: z.string().min(1).max(IMPORT_MAX_TEXT),
      }),
    )
    .min(1, msg('Nothing to import.'))
    .max(IMPORT_MAX_MESSAGES),
});

export const UpdateConversationBody = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    purpose: z.string().trim().max(200).nullable().optional(),
    contextId: z.string().uuid().nullable().optional(),
    attention: z.enum(['auto', 'priority', 'normal', 'quiet']).optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
    draft: z.string().max(10_000).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict();

const StickerPayload = z.object({ pack: z.string().max(40), sticker: z.string().max(40) });
/**
 * A place: where someone is (coordinates, and how sure the device was, in metres), or a place by
 * name to look up ("Café Riche, Downtown"). Never live: one moment, shared on purpose.
 */
export const LocationPayload = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).max(100_000).optional(),
    label: z.string().trim().max(200).optional(),
    /** Live: the point follows the sharer until then, or until they stop it (never under 18). */
    live: z
      .object({ minutes: z.union([z.literal(15), z.literal(60), z.literal(480)]) })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (p) => (p.lat === undefined) === (p.lng === undefined),
    msg('A place needs both coordinates.'),
  )
  .refine((p) => p.lat !== undefined || Boolean(p.label), msg('Choose a place.'))
  .refine((p) => !p.live || p.lat !== undefined, msg('A live location starts where you are.'));
export type LocationPayloadT = z.infer<typeof LocationPayload>;

/** Where a live location's sharer is now; only the latest point is kept. */
export const LiveLocationUpdate = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000).optional(),
  })
  .strict();

const ContactPayload = z.union([
  z.object({ userId: z.string().uuid() }),
  z.object({
    name: z.string().max(80),
    phone: z.string().max(40).optional(),
    email: z.string().max(254).optional(),
  }),
]);
export const PollPayload = z.object({
  question: z.string().trim().min(1).max(300),
  options: z
    .array(z.object({ id: z.string().max(20), text: z.string().trim().min(1).max(100) }))
    .min(2, msg('Add at least two options.'))
    .max(12),
  multiple: z.boolean().default(false),
});
/** What a booker asks of a catalog item (R58): which, how many, and, for the team, who does it. */
export const BookingAskBody = z
  .object({
    itemId: z.string().min(1).max(40),
    quantity: z.number().int().min(1).max(BOOKING_CAPACITY_MAX).default(1),
    providerId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type BookingAskInput = z.infer<typeof BookingAskBody>;

/** What a customer asks of the catalog on an Order card (R60). */
export const OrderAskBody = z
  .object({
    lines: z
      .array(
        z
          .object({
            itemId: z.string().min(1).max(40),
            quantity: z.number().int().min(1).max(BOOKING_CAPACITY_MAX),
          })
          .strict(),
      )
      .min(1)
      .max(ORDER_LINES_MAX),
    fulfilment: z.enum(['pickup', 'delivery']).nullable().optional(),
  })
  .strict();

const KitPayload = z.object({
  kit: z.string().max(40),
  fields: z.record(z.string(), z.unknown()),
  state: z.string().max(40).optional(),
  booking: BookingAskBody.optional(),
  order: OrderAskBody.optional(),
});

/** A private conversation's message as its sender's device sealed it (checked for shape only). */
export const SealedSchema = z.custom<SealedMessage>((v) => isSealed(v), {
  message: msg('That message isn’t sealed properly.'),
});

const Signature = z.custom<string>((v) => isSignature(v), {
  message: msg('That signature isn’t right.'),
});

/**
 * A device's public keys for private conversations (R18), with its own signature over them. It's
 * the first of its person's chain if they have no other (or `startOver`, which retires the
 * others); otherwise it waits for one of theirs to approve it.
 */
export const RegisterDeviceBody = z
  .object({
    id: z.string().uuid(),
    encryptionKey: z.custom<PublicJwk>((v) => isPublicKey(v), {
      message: msg('That key isn’t right.'),
    }),
    signingKey: z.custom<PublicJwk>((v) => isPublicKey(v), {
      message: msg('That key isn’t right.'),
    }),
    introduction: Signature,
    name: z.string().trim().max(80).optional(),
    startOver: z.boolean().optional(),
    /**
     * A phone signing in again: the device it registered before, with these very keys, is bound
     * to this session instead of a new one being made (R41).
     */
    resume: z.boolean().optional(),
  })
  .strict();

/** The recovery device (R41): its id and keys, introduced by the device registering it. */
export const RegisterRecoveryBody = z
  .object({
    id: z.string().uuid(),
    encryptionKey: z.custom<PublicJwk>((v) => isPublicKey(v), {
      message: msg('That key isn’t right.'),
    }),
    signingKey: z.custom<PublicJwk>((v) => isPublicKey(v), {
      message: msg('That key isn’t right.'),
    }),
    introduction: Signature,
  })
  .strict();

/** A device restores from the recovery key: the recovery device's signature over its introduction. */
export const RestoreDeviceBody = z.object({ introduction: Signature }).strict();

/** One of my devices approves another of mine: its signature over the new one's introduction. */
export const ApproveDeviceBody = z.object({ introduction: Signature }).strict();

export const SendMessageBody = z
  .object({
    clientId: z.string().min(8).max(64),
    kind: z
      .enum(['text', 'media', 'file', 'voice', 'location', 'contact', 'poll', 'kit', 'sticker'])
      .default('text'),
    body: z.string().max(10_000).nullable().optional(),
    payload: z.unknown().optional(),
    replyToId: z.string().uuid().nullable().optional(),
    fileIds: z.array(z.string().uuid()).max(10).optional(),
    urgent: z.boolean().optional(),
    mentions: z.array(z.string().uuid()).max(50).optional(),
    /** The sender's own label for the message; otherwise Caime detects it (PRD §18). */
    mode: z
      .enum(['talk', 'ask', 'plan', 'decide', 'share', 'request', 'confirm', 'pay', 'track'])
      .optional(),
    /** In a private conversation (R18): the message, sealed on the sender's device. */
    sealed: SealedSchema.optional(),
  })
  .superRefine((m, ctx) => {
    const need = (ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message });
    };
    switch (m.kind) {
      case 'text':
        need(Boolean(m.body?.trim()) || Boolean(m.sealed), msg('Write a message.'));
        break;
      case 'media':
      case 'file':
      case 'voice':
        need(Boolean(m.fileIds?.length), msg('Attach a file.'));
        break;
      case 'sticker':
        need(StickerPayload.safeParse(m.payload).success, msg('Choose a sticker.'));
        break;
      case 'location':
        need(LocationPayload.safeParse(m.payload).success, msg('Choose a location.'));
        break;
      case 'contact':
        need(ContactPayload.safeParse(m.payload).success, msg('Choose a contact.'));
        break;
      case 'poll':
        need(
          PollPayload.safeParse(m.payload).success,
          msg('Add a question and at least two options.'),
        );
        break;
      case 'kit':
        need(KitPayload.safeParse(m.payload).success, msg('That card is incomplete.'));
        break;
    }
  });
export type SendMessageBodyT = z.infer<typeof SendMessageBody>;

export const EditMessageBody = z
  .object({
    body: z.string().trim().min(1).max(10_000).optional(),
    /** A private conversation's message, sealed again as edited. */
    sealed: SealedSchema.optional(),
    /** Who the edited words mention (PRD §20), as a new message says. */
    mentions: z.array(z.string().uuid()).max(50).optional(),
    mode: z
      .enum(['talk', 'ask', 'plan', 'decide', 'share', 'request', 'confirm', 'pay', 'track'])
      .optional(),
  })
  .strict();

export const ReactionBody = z.object({ emoji: z.string().min(1).max(16) });
export const ReceiptsBody = z.object({
  delivered: z.number().int().min(0).optional(),
  read: z.number().int().min(0).optional(),
});
export const VoteBody = z.object({ optionIds: z.array(z.string().max(20)).max(12) });
export const ForwardBody = z.object({
  conversationIds: z.array(z.string().uuid()).min(1).max(20),
  clientId: z.string().min(8).max(64),
});
export const MembersBody = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) });

// --- Actions, decisions, contexts --------------------------------------------------------------

export const CreateTaskBody = z.object({
  title: z.string().trim().min(1, msg('What needs doing?')).max(200),
  notes: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueHasTime: z.boolean().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  /** Someone else: with `shared` it's a request they see; without, a private waiting item. */
  assigneeId: z.string().uuid().optional(),
  shared: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  contextId: z.string().uuid().optional(),
  clientId: z.string().min(8).max(64).optional(),
});

export const UpdateTaskBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    dueHasTime: z.boolean().optional(),
    remindAt: z.string().datetime().nullable().optional(),
    status: z.enum(['open', 'accepted', 'declined', 'done', 'cancelled']).optional(),
    /** Hand a wait to Cai, or take it back (R68). */
    caiFollowUp: z.boolean().optional(),
  })
  .strict();

/** Forget what Cai learned from someone's choices (R68): of one kind, or all of it. */
export const CaiForgetBody = z
  .object({
    kind: z
      .enum([
        'task',
        'reminder',
        'waiting',
        'decision',
        'topic',
        'relationship',
        'duplicate',
        'context',
      ])
      .optional(),
  })
  .strict();

export const CreateDecisionBody = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(4000).nullable().optional(),
  messageId: z.string().uuid().optional(),
  contextId: z.string().uuid().optional(),
});

export const CONTEXT_KINDS = [
  'project',
  'order',
  'trip',
  'appointment',
  'school',
  'event',
  'contract',
  'issue',
  'family',
  'other',
] as const;

export const CreateContextBody = z.object({
  kind: z.enum(CONTEXT_KINDS),
  title: z.string().trim().min(1).max(120),
  purpose: z.string().trim().max(300).nullable().optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
  externalRef: z.string().trim().max(120).nullable().optional(),
  conversationId: z.string().uuid().optional(),
});

export const UpdateContextBody = CreateContextBody.omit({ conversationId: true })
  .partial()
  .extend({ status: z.enum(['active', 'done', 'archived']).optional() });

export const PushSubscriptionBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('webpush'),
    subscription: z.object({
      endpoint: z.string().url().max(1000),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    }),
  }),
  z.object({ kind: z.literal('expo'), token: z.string().min(10).max(200) }),
]);

export const ReportBody = z.object({
  userId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  /** An organization (from its page), or one of its updates (with its orgId). */
  orgId: z.string().uuid().optional(),
  updateId: z.string().uuid().optional(),
  reason: z.enum(['spam', 'scam', 'harassment', 'impersonation', 'inappropriate', 'other']),
  details: z.string().trim().max(2000).optional(),
});

export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
/** The operator moving a report along (R49). */
export const ReportStatusBody = z.object({ status: z.enum(REPORT_STATUSES) });
/** The operator suspending an account, or lifting it (R49). */
export const SuspensionBody = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});
export const ReportsQuery = z.object({
  status: z.enum([...REPORT_STATUSES, 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const AiRewriteBody = z
  .object({
    text: z.string().trim().min(1).max(4000),
    style: z.enum(REWRITE_STYLES),
    conversationId: z.string().uuid(),
  })
  .strict();

export const AiTranslateBody = z
  .object({
    messageId: z.string().uuid(),
    /** A BCP 47 language; the reader's own language when absent. */
    to: z.string().trim().min(2).max(35).optional(),
  })
  .strict();

/** Spaces (PRD §40). */
const SpaceName = z.string().trim().min(1, msg('Give the space a name.')).max(80);
const SpacePurpose = z.string().trim().max(280).nullable();

export const CreateSpaceBody = z
  .object({
    name: SpaceName,
    kind: z.enum(SPACE_KINDS),
    purpose: SpacePurpose.optional(),
    memberIds: z.array(z.string().uuid()).max(200).default([]),
    /** An organization's space (R43): started by its owner or an admin, for its team. */
    orgId: z.string().uuid().optional(),
  })
  .strict();

export const UpdateSpaceBody = z
  .object({
    name: SpaceName.optional(),
    kind: z.enum(SPACE_KINDS).optional(),
    purpose: SpacePurpose.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, msg('Nothing to change.'));

export const SpaceRoleBody = z.object({ role: z.enum(['admin', 'member']) }).strict();

export const CreateSpaceConversationBody = z
  .object({
    title: z.string().trim().min(1, msg('Name the conversation.')).max(80),
    purpose: z.string().trim().max(280).nullable().optional(),
    /** Everyone in the space, or just you until others join. */
    everyone: z.boolean().default(false),
  })
  .strict();

/** Organizations (PRD §36). */
const OrgName = z.string().trim().min(1, msg('Give the organization a name.')).max(100);
const OrgAbout = z.string().trim().max(500).nullable();
/** The year an organization began: from the year 1000 to this one. */
const FoundedYear = z
  .number()
  .int()
  .min(1000, msg('Enter the year it began.'))
  .refine((y) => y <= latestFoundedYear(), msg('That year hasn’t come yet.'));
const OrgWebsite = z
  .string()
  .trim()
  .max(200)
  .url('Enter a web address like https://datac.com')
  .refine((u) => /^https?:\/\//i.test(u), msg('Enter a web address like https://datac.com'))
  .nullable();

const SlotMinutesSchema = z.union([
  z.literal(15),
  z.literal(20),
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);

/** A host's bookable hours (R51), or null to take bookings off. */
export const BookingHoursBody = z
  .object({
    timeZone: z
      .string()
      .min(1)
      .max(64)
      .refine(
        (tz) => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        },
        { message: msg('That isn’t a time zone.') },
      ),
    slotMinutes: SlotMinutesSchema,
    days: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            start: HHMM,
            end: HHMM,
          })
          .strict()
          .refine((d) => d.start < d.end, { message: msg('A day ends after it starts.') }),
      )
      .min(1)
      .max(7)
      .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, {
        message: msg('One range for each day.'),
      }),
    leadMinutes: z.number().int().min(0).max(10_080),
    horizonDays: z.number().int().min(1).max(90),
  })
  .strict();
export type BookingHoursInput = z.infer<typeof BookingHoursBody>;

/** Who sees or books something of a host's (R58, R61): everyone, connections, or spheres. */
const CatalogAudience = z.union([
  z.literal('public'),
  z.literal('connections'),
  z.array(SphereSchema).min(1).max(SPHERES.length),
]);
const CatalogId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, msg('That isn’t an item id.'));
/** An address under a host's (R61): letters and digits of any script, joined by hyphens. */
const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(SLUG_MAX)
  .refine((s) => slugError(s) !== 'shape' && slugError(s) !== 'empty', {
    message: msg('Use letters and digits, joined by hyphens.'),
  })
  .refine((s) => slugError(s) !== 'reserved', {
    message: msg('That address is one of Caime’s own words.'),
  });

/** A collection of a host's items (R61). */
export const CollectionBody = z
  .object({
    id: CatalogId,
    name: z.string().trim().min(1, msg('Name it.')).max(60),
    slug: SlugSchema.optional(),
    description: z.string().trim().max(300).nullable().default(null),
    audience: CatalogAudience,
  })
  .strict();
export type CollectionInput = z.infer<typeof CollectionBody>;

/** One thing a host can be booked for (R58). */
export const BookingItemBody = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, msg('That isn’t an item id.')),
    name: z.string().trim().min(1, msg('Name it.')).max(60),
    price: z
      .object({
        value: z.number().min(0).max(1_000_000_000),
        currency: z.string().regex(/^[A-Z]{3}$/, msg('Use a currency code like EGP.')),
      })
      .strict()
      .nullable(),
    unit: z.enum(['minutes', 'days', 'each']),
    minutes: SlotMinutesSchema.nullable(),
    capacity: z.number().int().min(1).max(BOOKING_CAPACITY_MAX),
    maxQuantity: z.number().int().min(1).max(BOOKING_CAPACITY_MAX),
    audience: CatalogAudience,
    providers: z.array(z.string().uuid()).max(100).nullable(),
    askTopic: z.boolean(),
    // R61: left out, an address is made from the name; a line about it; its collection.
    slug: SlugSchema.optional(),
    description: z.string().trim().max(300).nullable().default(null),
    collectionId: CatalogId.nullable().default(null),
    // R63: an image the host uploaded; checked as theirs when it's first set.
    photoFileId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .refine((i) => (i.unit === 'minutes' ? i.minutes !== null : i.minutes === null), {
    message: msg('An appointment has a length in minutes; a stay has none.'),
  })
  .refine(
    (i) =>
      i.unit === 'minutes'
        ? i.maxQuantity <= i.capacity
        : i.unit === 'days'
          ? i.maxQuantity <= BOOKING_DAYS_MAX
          : true,
    { message: msg('One booking can’t take more than the item has.') },
  )
  .refine((i) => i.unit !== 'each' || i.providers === null, {
    message: msg('Something ordered has nobody named to do it.'),
  });
export type BookingItemInput = z.infer<typeof BookingItemBody>;

/** How a host takes orders (R60), or null for none. */
export const OrderingBody = z
  .object({
    fulfilment: z
      .array(z.enum(['pickup', 'delivery']))
      .min(1)
      .max(2)
      .refine((f) => new Set(f).size === f.length, { message: msg('Each way once.') }),
    note: z.string().trim().max(300).nullable(),
  })
  .strict();

/** One way to be paid (R62): a link is the host's own https address; cash needs no details. */
export const PaymentMethodBody = z
  .object({
    id: CatalogId,
    kind: z.enum(PAYMENT_KINDS),
    label: z.string().trim().min(1, msg('Name it.')).max(60),
    details: z.string().trim().max(300).nullable().default(null),
    url: z.string().trim().max(500).nullable().default(null),
    audience: CatalogAudience,
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.kind === 'link') {
      const why = m.url ? paymentUrlError(m.url) : msg('A payment link needs its address.');
      if (why) ctx.addIssue({ code: 'custom', message: why, path: ['url'] });
    } else if (m.url) {
      ctx.addIssue({
        code: 'custom',
        message: msg('Only a payment link has an address.'),
        path: ['url'],
      });
    }
    if ((m.kind === 'bank' || m.kind === 'wallet') && !m.details)
      ctx.addIssue({
        code: 'custom',
        message: msg('Say what the payer needs: an account or a number.'),
        path: ['details'],
      });
  });

/** How a host is paid (R62), or null for not here. */
export const PaymentsBody = z
  .object({
    methods: z
      .array(PaymentMethodBody)
      .min(1)
      .max(PAYMENT_METHODS_MAX)
      .refine((ms) => new Set(ms.map((m) => m.id)).size === ms.length, {
        message: msg('Each way once.'),
      }),
    note: z.string().trim().max(300).nullable().default(null),
  })
  .strict();

/** A host's bookings (R58): hours, or null for none, and the catalog. */
export const BookingBody = z
  .object({
    /** Ordering (R60): left out, it stays as it is. */
    ordering: OrderingBody.nullable().optional(),
    booking: BookingHoursBody.nullable(),
    items: z
      .array(BookingItemBody)
      .max(BOOKING_ITEMS_MAX)
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
        message: msg('Each item once.'),
      })
      .default([]),
    /** Ways to be paid (R62): left out, they stay as they are; null turns them off. */
    payments: PaymentsBody.nullable().optional(),
    /** Collections (R61): left out, they stay as they are. */
    collections: z
      .array(CollectionBody)
      .max(COLLECTIONS_MAX)
      .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length, {
        message: msg('Each collection once.'),
      })
      .optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    // One address space for a host: an item's and a collection's never the same.
    const slugs = [...(b.collections ?? []), ...b.items]
      .map((x) => x.slug)
      .filter((x): x is string => Boolean(x));
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: 'custom', message: msg('Each address once.'), path: ['items'] });
    if (b.collections) {
      const ids = new Set(b.collections.map((c) => c.id));
      if (b.items.some((i) => i.collectionId && !ids.has(i.collectionId)))
        ctx.addIssue({
          code: 'custom',
          message: msg('That collection isn’t there.'),
          path: ['items'],
        });
    }
  });
export type BookingInput = z.infer<typeof BookingBody>;

export const CreateOrgBody = z
  .object({
    name: OrgName,
    handle: Handle,
    kind: z.enum(ORG_KINDS),
    about: OrgAbout.optional(),
    website: OrgWebsite.optional(),
    /** Where it's based (ISO 3166-1), for its defaults. */
    country: Country,
    foundedYear: FoundedYear.nullable().optional(),
  })
  .strict();

export const UpdateOrgBody = z
  .object({
    name: OrgName.optional(),
    kind: z.enum(ORG_KINDS).optional(),
    about: OrgAbout.optional(),
    website: OrgWebsite.optional(),
    country: Country.optional(),
    foundedYear: FoundedYear.nullable().optional(),
    /** Its logo: an image file the person uploaded, or null to take it away. */
    avatarFileId: z.string().uuid().nullable().optional(),
    /** How long it keeps its customers' conversations (R54), 1–3650 days; null keeps them. Its owner's. */
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, msg('Nothing to change.'));

export const OrgMembersBody = z
  .object({
    userIds: z.array(z.string().uuid()).min(1).max(100),
    role: z.enum(['admin', 'agent']).default('agent'),
  })
  .strict();

export const OrgMemberBody = z
  .object({
    role: z.enum(['admin', 'agent']).optional(),
    title: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, msg('Nothing to change.'));

export const OrgDomainBody = z.object({ domain: z.string().trim().min(3).max(260) }).strict();

// --- Business inbox (PRD §38) ----------------------------------------------------------------

export const AssignThreadBody = z.object({ userId: z.string().uuid().nullable() }).strict();

export const EscalateThreadBody = z
  .object({ note: z.string().trim().max(300).optional() })
  .strict();

/** Someone on the team writes to a person first, found by their handle (R14). */
export const StartThreadBody = z
  .object({
    handle: z.string().trim().min(1).max(64),
    clientId: z.string().min(8).max(64),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

// --- Apps (PRD §73–75) ------------------------------------------------------------------------

const WebhookUrl = z
  .string()
  .trim()
  .url('Enter the full address, starting with https://')
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), msg('Enter the full address, starting with https://'));

export const CreateOrgAppBody = z
  .object({
    name: z.string().trim().min(1).max(60),
    scopes: z.array(z.enum(API_SCOPES)).max(API_SCOPES.length).default([]),
    webhookUrl: WebhookUrl.nullable().optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).default([]),
  })
  .strict();

export const UpdateOrgAppBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    scopes: z.array(z.enum(API_SCOPES)).max(API_SCOPES.length).optional(),
    webhookUrl: WebhookUrl.nullable().optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, msg('Nothing to change.'));

/** One change to a checklist card (core kit-cards.ts applies it). */
export const ChecklistOpBody = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), text: z.string().max(400) }),
  z.object({ op: z.literal('toggle'), itemId: z.string().max(10), done: z.boolean() }),
  z.object({ op: z.literal('edit'), itemId: z.string().max(10), text: z.string().max(400) }),
  z.object({ op: z.literal('remove'), itemId: z.string().max(10) }),
]);

/** A share of a split marked settled, or not after all (R38: a record, never a transfer). */
export const SplitOpBody = z.object({
  op: z.enum(['settle', 'unsettle']),
  userId: z.string().uuid(),
});

// --- Billing ---------------------------------------------------------------------------------

/** Buy a plan (R25): Pro for yourself, or Business for an organization you run. */
export const CheckoutBody = z
  .object({
    plan: z.enum(BILLED_PLANS),
    interval: z.enum(BILLING_INTERVALS),
    orgId: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => (b.plan === 'business') === Boolean(b.orgId), {
    message: msg('Pro is for you; Business is for an organization.'),
  });

/** Manage what you pay, or what an organization you run pays, in Stripe's portal. */
export const BillingPortalBody = z.object({ orgId: z.string().uuid().optional() }).strict();
