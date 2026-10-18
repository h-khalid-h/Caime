import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';

/** A step of setting an organization up that can be done or not (R57, M16 C2b). */
export type SetupStepKey = 'hours' | 'team' | 'verify' | 'agent';

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
  /** What the step is, as the checklist names it. */
  label: string;
  /** What the "Set up" row says while it's the first not done. */
  next: string;
}

/**
 * The steps a clinic takes once its door is there (it always is), in the order that lets
 * customers in soonest: bookable hours, the rest of the team (C3a's invite), proving its domain,
 * an AI agent to answer first. A clinic without a domain is never stuck before its hours and its
 * team (review 2026-10-17 §1 H4): verifying waits its turn and stays on the list until done.
 */
export function setupSteps(
  org: Pick<OrgView, 'booking' | 'memberCount' | 'verified' | 'agent'>,
): SetupStep[] {
  return [
    {
      key: 'hours',
      done: org.booking !== null,
      label: tr('Bookable hours'),
      next: tr('Next: set bookable hours'),
    },
    {
      key: 'team',
      done: org.memberCount > 1,
      label: tr('The rest of the team'),
      next: tr('Next: invite your team'),
    },
    {
      key: 'verify',
      done: org.verified,
      label: tr('Your domain, verified'),
      next: tr('Next: verify your domain'),
    },
    {
      key: 'agent',
      done: org.agent !== null,
      label: tr('An AI agent that answers first'),
      next: tr('Next: an AI agent that answers first'),
    },
  ];
}

/** What the "Set up" row says (R57): the first step still to take, else what the screen holds. */
export function setupNextLine(
  org: Pick<OrgView, 'booking' | 'memberCount' | 'verified' | 'agent'>,
): string {
  return (
    setupSteps(org).find((s) => !s.done)?.next ??
    tr('Your door, domain, customers’ data, hours, AI agent, apps and plan')
  );
}
