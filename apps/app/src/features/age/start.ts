/**
 * A check of one's age begun on the web (M16 B7): the provider's page in this tab, which comes
 * back to Settings · Security with `?age=` saying what happened (`AgeStatus` reads it). The
 * phone's is start.native.ts.
 */
import type { AgeReturnState, AgeTrigger } from '@caime/core/age-assurance';
import { endpoints } from '@/api/endpoints';
import { leaveFor } from '@/lib/links';

export async function startAgeCheck(trigger: AgeTrigger | null): Promise<AgeReturnState | 'left'> {
  const { url } = await endpoints.startAgeCheck('web', trigger);
  leaveFor(url);
  return 'left';
}
