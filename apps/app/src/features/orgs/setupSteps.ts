import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';

/**
 * What the "Set up" row says (R57): the first step still to take, in a clinic's order (the
 * door is always there; proving who you are, then hours), else what the screen holds.
 */
export function setupNextLine(org: OrgView): string {
  if (!org.verified) return tr('Next: verify your domain');
  if (!org.booking) return tr('Next: set bookable hours');
  return tr('Your door, domain, customers’ data, hours, AI agent, apps and plan');
}
