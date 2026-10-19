/**
 * Plans (PRD §84, R23): what each one includes. The wedge is free forever: connections,
 * relationships, what needs you, what you're waiting for, search and sync are in every plan and
 * never counted. Plans differ only in what costs money to run (AI, storage) and in what
 * organizations buy (a bigger team, more apps, insights). Billing is an integration (R25): until
 * it's connected, an operator sets plans.
 *
 * A lower plan never takes anything away: nobody is removed from a team and no app stops. It
 * only stops new additions until they fit.
 */
import type { Plan } from './api';

export type OrgPlan = 'free' | 'business' | 'enterprise';

/**
 * Which model does the work that asks the most of one (M16 H7, docs/RESOURCES.md "What a person
 * costs"): `top` (the server's ANTHROPIC_MODEL) where someone pays, `light` (ANTHROPIC_MODEL_LIGHT,
 * forty times cheaper by default) otherwise. Everything else runs on the light one for everyone.
 */
export type ModelTier = 'top' | 'light';

export const PERSON_PLANS = [
  'personal',
  'pro',
  'business',
  'enterprise',
] as const satisfies readonly Plan[];
export const ORG_PLANS = ['free', 'business', 'enterprise'] as const satisfies readonly OrgPlan[];

export interface PersonAllowance {
  /**
   * AI assist in any 24 hours, in euros of model time (M16 G9, R107): what the calls cost by the
   * server's price list, never how many there were, so a search's reading or a short rewrite
   * takes a sliver of a day and a long search for follow-ups on the top model a good deal more.
   * People are told how much is left in words, never a price.
   */
  aiEurPerDay: number;
  /** Files you've uploaded, in all, in bytes. */
  storageBytes: number;
  /** Automations kept at once (PRD §84: automation is Pro's). Never more than AUTOMATIONS_MAX. */
  automations: number;
  /**
   * Relationship insights (R47): how your relationships are going, from your own messages and
   * labels only. The relationships themselves, and what needs you, are free (R23).
   */
  insights: boolean;
  /** The model that finds follow-ups in a conversation: the most capable one on a paid plan. */
  aiModel: ModelTier;
}

export interface OrgAllowance {
  /** People on the team. An app's bot isn't counted. */
  teamSize: number;
  /** Apps connected at once. */
  apps: number;
  /** How fast the team answers, how many customers write, what's still open (PRD §71). */
  insights: boolean;
  /**
   * Conversations the team starts with someone in any 24 hours (R14). A conversation the
   * customer starts is never counted.
   */
  startsPerDay: number;
  /**
   * What its AI agent writes to customers in any 24 hours (PRD §75). Past it, the agent stays
   * quiet and the team answers, as it would without one.
   */
  agentRepliesPerDay: number;
  /**
   * What its AI agent may cost in any 24 hours, in euros of model time (M16 G9, R107): a
   * backstop above a day of answers of the usual size, so that a flood of long questions can't
   * run up what the count alone allows. Past it, the agent stays quiet as past the count.
   */
  agentEurPerDay: number;
  /** The model its AI agent answers on: the most capable one on a paid plan. */
  agentModel: ModelTier;
}

const GB = 1024 ** 3;

export const PERSON_ALLOWANCES: Readonly<Record<Plan, PersonAllowance>> = {
  personal: {
    aiEurPerDay: 0.5,
    storageBytes: 5 * GB,
    automations: 5,
    insights: false,
    aiModel: 'light',
  },
  pro: { aiEurPerDay: 2, storageBytes: 100 * GB, automations: 50, insights: true, aiModel: 'top' },
  // A business or enterprise seat includes everything Pro does.
  business: {
    aiEurPerDay: 2,
    storageBytes: 100 * GB,
    automations: 50,
    insights: true,
    aiModel: 'top',
  },
  enterprise: {
    aiEurPerDay: 10,
    storageBytes: 1024 * GB,
    automations: 50,
    insights: true,
    aiModel: 'top',
  },
};

export const ORG_ALLOWANCES: Readonly<Record<OrgPlan, OrgAllowance>> = {
  free: {
    teamSize: 3,
    apps: 1,
    insights: false,
    startsPerDay: 20,
    agentRepliesPerDay: 50,
    agentEurPerDay: 0.3,
    agentModel: 'light',
  },
  business: {
    teamSize: 100,
    apps: 25,
    insights: true,
    startsPerDay: 1000,
    agentRepliesPerDay: 2000,
    agentEurPerDay: 30,
    agentModel: 'top',
  },
  enterprise: {
    teamSize: 10_000,
    apps: 200,
    insights: true,
    startsPerDay: 20_000,
    agentRepliesPerDay: 20_000,
    agentEurPerDay: 300,
    agentModel: 'top',
  },
};

/**
 * Organizations on the Free plan one person may run as owner at once (M16 H1): each comes with
 * an AI agent's daily answers, a cost Caime carries. Moving one to Business, or closing one,
 * makes room; nothing already running is ever stopped.
 */
export const FREE_ORGS_PER_OWNER = 3;

/** What a seat on an organization's team includes for its person (PRD §84). */
export const SEAT_PLANS: Readonly<Record<OrgPlan, Plan | null>> = {
  free: null,
  business: 'business',
  enterprise: 'enterprise',
};

/** How much a person's plan includes, to compare two: a Business seat includes what Pro does. */
const INCLUDES: Readonly<Record<Plan, number>> = {
  personal: 0,
  pro: 1,
  business: 1,
  enterprise: 2,
};

/**
 * The plan someone's allowances come from (M16 H1): their own, or a seat's where it includes
 * more. `seats` are the plans of the open organizations whose team they're on; `seat` is the
 * index of the one it came from, or null when it's their own.
 */
export function planWithSeats(
  own: Plan,
  seats: readonly OrgPlan[],
): { plan: Plan; seat: number | null } {
  let plan = own;
  let seat: number | null = null;
  for (const [i, s] of seats.entries()) {
    const p = SEAT_PLANS[s];
    if (p && INCLUDES[p] > INCLUDES[plan]) {
      plan = p;
      seat = i;
    }
  }
  return { plan, seat };
}

export const PLAN_NAMES: Readonly<Record<Plan | OrgPlan, string>> = {
  personal: 'Personal',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
  free: 'Free',
};

/** The plan to suggest when someone reaches what theirs includes, or null at the top. */
export function nextPersonPlan(plan: Plan): Plan | null {
  return plan === 'personal' ? 'pro' : plan === 'enterprise' ? null : 'enterprise';
}

export function nextOrgPlan(plan: OrgPlan): OrgPlan | null {
  return plan === 'free' ? 'business' : plan === 'business' ? 'enterprise' : null;
}

export function isPersonPlan(value: string): value is Plan {
  return (PERSON_PLANS as readonly string[]).includes(value);
}
