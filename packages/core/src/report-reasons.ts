/**
 * What's wrong, in the words a report offers it (R49, M16 B6): one table for the app's report
 * sheet and a visitor's report form on a page, in `REPORT_REASONS`' order. Labels are keys, shown
 * through `tr`; nothing here pulls in zod.
 */
import { msg } from './i18n';
import type { ReportReason } from './schemas';

export const REPORT_REASON_CHOICES: ReadonlyArray<{
  value: ReportReason;
  label: string;
  detail: string;
}> = [
  { value: 'spam', label: msg('Spam'), detail: msg('Ads, or the same message again and again') },
  { value: 'scam', label: msg('A scam'), detail: msg('Asking for money, a password or a code') },
  {
    value: 'harassment',
    label: msg('Harassment or bullying'),
    detail: msg('Threats, insults, hounding'),
  },
  {
    value: 'impersonation',
    label: msg('Pretending to be someone'),
    detail: msg('A person or organization they aren’t'),
  },
  {
    value: 'inappropriate',
    label: msg('Inappropriate'),
    detail: msg('Violence, sexual content, hate'),
  },
  {
    value: 'child_safety',
    label: msg('A child’s safety'),
    detail: msg('Someone under 18 at risk, or sexual content involving a child'),
  },
  { value: 'other', label: msg('Something else'), detail: msg('Say what below') },
];
