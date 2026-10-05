import type { OrgPlanView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { nextOrgPlan, ORG_ALLOWANCES, PLAN_NAMES } from '@caime/core/plans';

// On its own so the page's "add people" sheet and the setup screen's plan and apps cards share
// one line without sharing the plan card's chunk (it would move into `__common`).
const apps = (n: number) => (n === 1 ? 'one app' : `${n} apps`);

/** What the next plan up adds, in a sentence; null at the top. */
export function nextOrgPlanLine(plan: OrgPlanView): string | null {
  const next = nextOrgPlan(plan.plan);
  if (!next) return null;
  const a = ORG_ALLOWANCES[next];
  const insights = a.insights && !plan.allowance.insights;
  return tr('{PLAN_NAMES} has room for {teamSize} people and {apps}{with}.', {
    PLAN_NAMES: PLAN_NAMES[next],
    teamSize: a.teamSize,
    apps: apps(a.apps),
    with: insights ? tr(', with insights into how fast the team answers') : '',
  });
}
