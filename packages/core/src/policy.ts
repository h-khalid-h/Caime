/**
 * Relationship policies (PRODUCT-REVIEW R11): one model for relationship-aware notifications
 * (PRD §32), smart inbox rules (§68), templates (§70) and privacy presets (§34). A policy
 * matches a sphere, optionally a role and an organization, or one connection. The most specific
 * matching policy wins, field by field.
 */
import type { Sphere } from './taxonomy';
import { SPHERE_DEFS } from './taxonomy';
import { isWithinSchedule, nextScheduleStart, type Schedule, workHours } from './time';

export const NOTIFY_MODES = ['always', 'schedule', 'important_only', 'mute'] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];
export const PRIORITIES = ['priority', 'normal', 'quiet'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const AI_TONES = ['neutral', 'friendly', 'professional'] as const;
export type AiTone = (typeof AI_TONES)[number];
export const PRIVACY_PRESETS = ['open', 'standard', 'limited'] as const;
export type PrivacyPreset = (typeof PRIVACY_PRESETS)[number];

export interface PolicyScope {
  sphere?: Sphere | null;
  role?: string | null;
  orgId?: string | null;
  connectionId?: string | null;
}

export interface PolicySettings {
  notify?: NotifyMode;
  schedule?: Schedule | null;
  /** Urgent messages from this relationship may break through quiet hours (R10). */
  allowUrgent?: boolean;
  priority?: Priority;
  /** "Manager → Priority during work hours": priority applies only inside `schedule`. */
  priorityInScheduleOnly?: boolean;
  aiTone?: AiTone;
  /** Offer a follow-up when my question gets no reply within this many hours (PRD §69). */
  followUpHours?: number | null;
  privacy?: PrivacyPreset;
}

export interface RelationshipPolicy {
  id: string;
  /** Templates have names ("My Customers"); plain rules don't. */
  name?: string | null;
  scope: PolicyScope;
  settings: PolicySettings;
}

export type Specificity = 'connection' | 'role_org' | 'role' | 'sphere_org' | 'sphere' | 'default';

export interface EffectivePolicy {
  notify: NotifyMode;
  schedule: Schedule | null;
  allowUrgent: boolean;
  priority: Priority;
  priorityInScheduleOnly: boolean;
  aiTone: AiTone;
  followUpHours: number | null;
  privacy: PrivacyPreset;
  /** The policies that contributed, most specific first, for "why" explanations. */
  sources: Array<{ id: string; name: string | null; level: Specificity }>;
}

export interface PolicyTarget {
  sphere: Sphere | null;
  role?: string | null;
  orgId?: string | null;
  connectionId?: string | null;
}

const RANK: Record<Specificity, number> = {
  connection: 100,
  role_org: 50,
  role: 40,
  sphere_org: 30,
  sphere: 20,
  default: 0,
};

export const BASE_POLICY: Omit<EffectivePolicy, 'sources'> = {
  notify: 'always',
  schedule: null,
  allowUrgent: false,
  priority: 'normal',
  priorityInScheduleOnly: false,
  aiTone: 'neutral',
  followUpHours: null,
  privacy: 'standard',
};

function levelOf(scope: PolicyScope): Specificity {
  if (scope.connectionId) return 'connection';
  if (scope.role && scope.orgId) return 'role_org';
  if (scope.role) return 'role';
  if (scope.sphere && scope.orgId) return 'sphere_org';
  if (scope.sphere) return 'sphere';
  return 'default';
}

export function policyMatches(scope: PolicyScope, target: PolicyTarget): boolean {
  if (scope.connectionId) return scope.connectionId === target.connectionId;
  if (scope.sphere && scope.sphere !== target.sphere) return false;
  if (scope.role && scope.role !== target.role) return false;
  if (scope.orgId && scope.orgId !== target.orgId) return false;
  return true;
}

export function resolvePolicy(
  policies: RelationshipPolicy[],
  target: PolicyTarget,
): EffectivePolicy {
  const matching = policies
    .filter((p) => policyMatches(p.scope, target))
    .map((p) => ({ p, level: levelOf(p.scope) }))
    .sort((a, b) => RANK[b.level] - RANK[a.level]);
  const result: EffectivePolicy = { ...BASE_POLICY, sources: [] };
  const keys = Object.keys(BASE_POLICY) as Array<keyof typeof BASE_POLICY>;
  const decided = new Set<string>();
  for (const { p, level } of matching) {
    let contributed = false;
    for (const k of keys) {
      if (decided.has(k)) continue;
      const v = p.settings[k as keyof PolicySettings];
      if (v !== undefined) {
        (result as unknown as Record<string, unknown>)[k] = v;
        decided.add(k);
        contributed = true;
      }
    }
    if (contributed) result.sources.push({ id: p.id, name: p.name ?? null, level });
  }
  return result;
}

/** The defaults every account starts with; accepted in one tap during onboarding (R9). */
export function defaultPolicies(workweek: number[]): Array<Omit<RelationshipPolicy, 'id'>> {
  const office = workHours(workweek);
  const extended: Schedule = { days: workweek, start: '08:00', end: '20:00' };
  return [
    {
      scope: { sphere: 'family' },
      settings: {
        notify: 'always',
        allowUrgent: true,
        priority: 'priority',
        aiTone: 'friendly',
        privacy: 'open',
      },
    },
    {
      scope: { sphere: 'friend' },
      settings: { notify: 'always', aiTone: 'friendly', privacy: 'open' },
    },
    { scope: { sphere: 'acquaintance' }, settings: { notify: 'always', privacy: 'limited' } },
    {
      scope: { sphere: 'work' },
      settings: { notify: 'schedule', schedule: extended, aiTone: 'professional' },
    },
    {
      scope: { sphere: 'work', role: 'manager' },
      settings: { priority: 'priority', priorityInScheduleOnly: true, allowUrgent: true },
    },
    {
      name: 'My Customers',
      scope: { sphere: 'customer' },
      settings: {
        notify: 'schedule',
        schedule: office,
        priority: 'priority',
        priorityInScheduleOnly: true,
        aiTone: 'professional',
        privacy: 'limited',
      },
    },
    {
      name: 'My Vendors',
      scope: { sphere: 'vendor' },
      settings: {
        notify: 'important_only',
        aiTone: 'professional',
        followUpHours: 48,
        privacy: 'limited',
      },
    },
    { scope: { sphere: 'service_provider' }, settings: { notify: 'always', privacy: 'limited' } },
    {
      scope: { sphere: 'professional' },
      settings: {
        notify: 'schedule',
        schedule: office,
        aiTone: 'professional',
        privacy: 'limited',
      },
    },
    { scope: { sphere: 'community' }, settings: { notify: 'important_only', privacy: 'limited' } },
    {
      scope: { sphere: 'organization' },
      settings: { notify: 'important_only', aiTone: 'professional', privacy: 'limited' },
    },
    {
      scope: { sphere: 'public' },
      settings: { notify: 'mute', priority: 'quiet', privacy: 'limited' },
    },
  ];
}

/** Whether a policy's schedule is active now (always true without a schedule). */
export function scheduleActive(
  policy: Pick<EffectivePolicy, 'schedule'>,
  now: Date,
  timeZone: string,
): boolean {
  return !policy.schedule || isWithinSchedule(policy.schedule, now, timeZone);
}

/** Priority as it applies right now ("priority during work hours"). */
export function currentPriority(policy: EffectivePolicy, now: Date, timeZone: string): Priority {
  if (
    policy.priority === 'priority' &&
    policy.priorityInScheduleOnly &&
    !scheduleActive(policy, now, timeZone)
  ) {
    return 'normal';
  }
  return policy.priority;
}

// ---------------------------------------------------------------------------------------------
// Notification decisions (PRD §31–§33)

export type NotificationLevel = 'activity' | 'attention' | 'urgency';

export type NotificationKind =
  | 'message'
  | 'mention'
  | 'reply'
  | 'request'
  | 'question'
  | 'connection_request'
  | 'task_due'
  | 'reminder'
  | 'waiting_resolved'
  | 'decision'
  | 'call';

export interface NotificationEvent {
  kind: NotificationKind;
  /** The sender flagged the message urgent. Only counts if the policy allows it (R10). */
  urgent?: boolean;
}

export interface NotificationContext {
  now: Date;
  timeZone: string;
  /** The recipient muted this conversation. */
  muted?: boolean;
  /** The recipient's own override for this conversation. */
  conversationPriority?: Priority | 'auto';
  /** Account-wide do-not-disturb window, e.g. 22:00–07:00 every day. */
  quietHours?: Schedule | null;
  /** Label for reasons, e.g. "Manager · DATA C". */
  relationshipLabel?: string | null;
}

export interface NotificationDecision {
  /** push: alert now · silent: in-app only · held: alert when `holdUntil` arrives. */
  deliver: 'push' | 'silent' | 'held';
  level: NotificationLevel;
  holdUntil: string | null;
  reason: string;
}

function levelFor(event: NotificationEvent, policy: EffectivePolicy): NotificationLevel {
  if (event.urgent && policy.allowUrgent) return 'urgency';
  switch (event.kind) {
    case 'mention':
    case 'reply':
    case 'request':
    case 'question':
    case 'connection_request':
    case 'task_due':
    case 'reminder':
    case 'call':
      return 'attention';
    default:
      return 'activity';
  }
}

function scheduleText(s: Schedule): string {
  return `${s.start}–${s.end}`;
}

export function decideNotification(
  policy: EffectivePolicy,
  event: NotificationEvent,
  ctx: NotificationContext,
): NotificationDecision {
  const level = levelFor(event, policy);
  const who = ctx.relationshipLabel ? `${ctx.relationshipLabel} · ` : '';
  const push = (reason: string): NotificationDecision => ({
    deliver: 'push',
    level,
    holdUntil: null,
    reason,
  });
  const silent = (reason: string): NotificationDecision => ({
    deliver: 'silent',
    level,
    holdUntil: null,
    reason,
  });

  // Things the user asked for themselves always arrive.
  if (event.kind === 'reminder' || event.kind === 'task_due') return push('Your reminder');
  if (level === 'urgency') return push(`${who}urgent, allowed to break through`);

  if (ctx.muted) return silent('Muted conversation');
  if (
    ctx.quietHours &&
    isWithinSchedule(ctx.quietHours, ctx.now, ctx.timeZone) &&
    event.kind !== 'call'
  ) {
    const until = nextQuietEnd(ctx.quietHours, ctx.now, ctx.timeZone);
    return { deliver: 'held', level, holdUntil: until, reason: 'Quiet hours' };
  }

  const important = level !== 'activity' || ctx.conversationPriority === 'priority';
  switch (policy.notify) {
    case 'mute':
      return silent(`${who}muted`);
    case 'important_only':
      return important ? push(`${who}needs you`) : silent(`${who}quiet unless important`);
    case 'schedule': {
      if (!policy.schedule || isWithinSchedule(policy.schedule, ctx.now, ctx.timeZone)) {
        return push(`${who}within ${policy.schedule ? scheduleText(policy.schedule) : 'hours'}`);
      }
      if (event.kind === 'call') return silent(`${who}outside ${scheduleText(policy.schedule)}`);
      const next = nextScheduleStart(policy.schedule, ctx.now, ctx.timeZone);
      return {
        deliver: 'held',
        level,
        holdUntil: next ? next.toISOString() : null,
        reason: `${who}outside ${scheduleText(policy.schedule)}`,
      };
    }
    default:
      return push(`${who}always notify`);
  }
}

function nextQuietEnd(quiet: Schedule, now: Date, timeZone: string): string | null {
  // The end of quiet hours is the start of the complementary window.
  const inverse: Schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: quiet.end, end: quiet.start };
  const next = nextScheduleStart(inverse, now, timeZone);
  return next ? next.toISOString() : null;
}

/** Plain-language summary of a policy for settings screens: "Notify 08:00–20:00 · Priority". */
export function describePolicy(policy: EffectivePolicy): string {
  const parts: string[] = [];
  switch (policy.notify) {
    case 'always':
      parts.push('Always notify');
      break;
    case 'schedule':
      parts.push(
        policy.schedule ? `Notify ${scheduleText(policy.schedule)}` : 'Notify on schedule',
      );
      break;
    case 'important_only':
      parts.push('Quiet unless important');
      break;
    case 'mute':
      parts.push('Muted');
      break;
  }
  if (policy.priority === 'priority')
    parts.push(policy.priorityInScheduleOnly ? 'Priority in hours' : 'Priority');
  if (policy.priority === 'quiet') parts.push('Quiet');
  if (policy.followUpHours) parts.push(`Follow up after ${policy.followUpHours} h`);
  return parts.join(' · ');
}

export function sphereLabel(sphere: Sphere | null | undefined): string {
  return sphere ? SPHERE_DEFS[sphere].label : 'Not classified';
}
