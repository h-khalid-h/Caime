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

export const PERSON_PLANS = [
  'personal',
  'pro',
  'business',
  'enterprise',
] as const satisfies readonly Plan[];
export const ORG_PLANS = ['free', 'business', 'enterprise'] as const satisfies readonly OrgPlan[];

export interface PersonAllowance {
  /** AI assist actions in any 24 hours (rewrite, translate, catch up, find follow-ups). */
  aiPerDay: number;
  /** Files you've uploaded, in all, in bytes. */
  storageBytes: number;
}

export interface OrgAllowance {
  /** People on the team. An app's bot isn't counted. */
  teamSize: number;
  /** Apps connected at once. */
  apps: number;
  /** How fast the team answers, how many customers write, what's still open (PRD §71). */
  insights: boolean;
}

const GB = 1024 ** 3;

export const PERSON_ALLOWANCES: Readonly<Record<Plan, PersonAllowance>> = {
  personal: { aiPerDay: 10, storageBytes: 5 * GB },
  pro: { aiPerDay: 200, storageBytes: 100 * GB },
  // A business or enterprise seat includes everything Pro does.
  business: { aiPerDay: 200, storageBytes: 100 * GB },
  enterprise: { aiPerDay: 1000, storageBytes: 1024 * GB },
};

export const ORG_ALLOWANCES: Readonly<Record<OrgPlan, OrgAllowance>> = {
  free: { teamSize: 3, apps: 1, insights: false },
  business: { teamSize: 100, apps: 25, insights: true },
  enterprise: { teamSize: 10_000, apps: 200, insights: true },
};

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

export function isOrgPlan(value: string): value is OrgPlan {
  return (ORG_PLANS as readonly string[]).includes(value);
}

export function isPersonPlan(value: string): value is Plan {
  return (PERSON_PLANS as readonly string[]).includes(value);
}
