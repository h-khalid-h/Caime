import { msg } from './i18n';
/**
 * AI assist (PRD §45, R17): what a draft can become, and the label everything a model wrote
 * carries. Model output is a suggestion: it is shown with this label and used only on a tap.
 */
export const AI_LABEL = msg('Suggested by Cai');

export const REWRITE_STYLES = ['clearer', 'shorter', 'formal', 'friendly'] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];

export const REWRITE_LABELS: Record<RewriteStyle, string> = {
  clearer: 'Clearer',
  shorter: 'Shorter',
  formal: msg('More formal'),
  friendly: 'Friendlier',
};
