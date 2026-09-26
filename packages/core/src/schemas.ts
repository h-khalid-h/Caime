/**
 * API request contracts (docs/ARCHITECTURE.md, "API conventions"). The server validates every
 * body with these; clients use the same schemas for forms, so a rule changes in one place.
 */
import { z } from 'zod';
import { AI_TONES, NOTIFY_MODES, PRIORITIES, PRIVACY_PRESETS } from './policy';
import { PRIVACY_FIELDS } from './privacy';
import { SPHERES } from './taxonomy';

export const Handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/,
    'Use 3–30 letters, numbers, dots or underscores.',
  )
  .refine((h) => !/[._]{2}/.test(h), 'Dots and underscores can’t be next to each other.');

export const Email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

export const Password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .refine((p) => new Set(p).size >= 5, 'Use a less repetitive password.');

export const DisplayName = z.string().trim().min(1, 'Enter your name.').max(80);

const TimeZone = z.string().min(1).max(64);
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
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
  birthYear: z.number().int(),
  timeZone: TimeZone.optional(),
  locale: z.string().max(35).optional(),
  client: z.enum(['web', 'native']).default('web'),
  deviceName: z.string().max(80).optional(),
  /** Invite link token that brought this person here (R1). */
  invite: z.string().max(200).optional(),
});

export const LoginBody = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or handle.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
  client: z.enum(['web', 'native']).default('web'),
  deviceName: z.string().max(80).optional(),
});

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: Password,
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
  })
  .strict();

export const UpdateMeBody = z
  .object({
    displayName: DisplayName.optional(),
    handle: Handle.optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    pronouns: z.string().trim().max(40).nullable().optional(),
    statusText: z.string().trim().max(80).nullable().optional(),
    statusEmoji: z.string().max(16).nullable().optional(),
    presence: z.enum(['auto', 'available', 'busy', 'away', 'invisible']).optional(),
    timeZone: TimeZone.optional(),
    locale: z.string().max(35).optional(),
    region: z.string().length(2).toUpperCase().nullable().optional(),
    workweek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    quietHours: ScheduleSchema.nullable().optional(),
    preferences: Preferences.optional(),
    aiEnabled: z.boolean().optional(),
    avatarFileId: z.string().uuid().nullable().optional(),
    onboarded: z.boolean().optional(),
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

// --- Suggestions -----------------------------------------------------------------------------

export const AcceptSuggestionBody = z.object({
  /** The user may edit before accepting ("Change", PRD §12). */
  title: z.string().trim().min(1).max(200).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  relationship: RelationshipInput.optional(),
});

// --- Conversations and messages ----------------------------------------------------------------

export const CreateConversationBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('direct'),
    userId: z.string().uuid(),
    /** A titled topic conversation with the same person (PRD §16). */
    title: z.string().trim().min(1).max(80).optional(),
    contextId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('group'),
    title: z.string().trim().min(1, 'Name the group.').max(80),
    purpose: z.string().trim().max(200).optional(),
    memberIds: z.array(z.string().uuid()).min(1, 'Add at least one person.').max(255),
  }),
]);

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
const LocationPayload = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(200).optional(),
  live: z.boolean().optional(),
});
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
    .min(2, 'Add at least two options.')
    .max(12),
  multiple: z.boolean().default(false),
});
const KitPayload = z.object({
  kit: z.string().max(40),
  fields: z.record(z.string(), z.unknown()),
  state: z.string().max(40).optional(),
});

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
    /** The sender's own label for the message; otherwise Caishy detects it (PRD §18). */
    mode: z
      .enum(['talk', 'ask', 'plan', 'decide', 'share', 'request', 'confirm', 'pay', 'track'])
      .optional(),
  })
  .superRefine((m, ctx) => {
    const need = (ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message });
    };
    switch (m.kind) {
      case 'text':
        need(Boolean(m.body?.trim()), 'Write a message.');
        break;
      case 'media':
      case 'file':
      case 'voice':
        need(Boolean(m.fileIds?.length), 'Attach a file.');
        break;
      case 'sticker':
        need(StickerPayload.safeParse(m.payload).success, 'Choose a sticker.');
        break;
      case 'location':
        need(LocationPayload.safeParse(m.payload).success, 'Choose a location.');
        break;
      case 'contact':
        need(ContactPayload.safeParse(m.payload).success, 'Choose a contact.');
        break;
      case 'poll':
        need(PollPayload.safeParse(m.payload).success, 'Add a question and at least two options.');
        break;
      case 'kit':
        need(KitPayload.safeParse(m.payload).success, 'That card is incomplete.');
        break;
    }
  });
export type SendMessageBodyT = z.infer<typeof SendMessageBody>;

export const EditMessageBody = z
  .object({
    body: z.string().trim().min(1).max(10_000).optional(),
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
