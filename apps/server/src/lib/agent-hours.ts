import { type AgentWhen, type BookingHours, openAt } from '@caime/core';

/**
 * Whether an organization's AI agent answers now (M16 G6a): always, or, where it answers only
 * while the organization is closed, while its hours say so. Without hours nothing says it's
 * open, so it answers. The automatic replies read the same rule: while it's quiet, they greet.
 * Apart from `agent.ts`, so the agent and the automatic replies (`org-replies.ts`) each read it
 * and the agent may hand its customer to them (M17 I1d).
 */
export function agentAnswersNow(
  answersWhen: AgentWhen,
  hours: BookingHours | null,
  now: Date,
): boolean {
  return answersWhen === 'always' || !hours || !openAt(hours, now);
}
