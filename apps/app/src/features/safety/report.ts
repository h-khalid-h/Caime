/**
 * Asking to report something: where it's asked from (a person, a message, an organization, an
 * update) and what, kept apart from the sheet that asks why, which loads when it's first needed.
 */
import { create } from 'zustand';
import type { endpoints } from '@/api/endpoints';

export type Body = Parameters<typeof endpoints.report>[0];
export type Reason = Body['reason'];
export type Target = Omit<Body, 'reason' | 'details'>;

export const useReport = create<{ target: Target | null; name: string }>(() => ({
  target: null,
  name: '',
}));

/** Asks what's wrong with `target` (named `name` in the sheet), and sends the report. */
export function report(target: Target, name: string) {
  useReport.setState({ target, name });
}
