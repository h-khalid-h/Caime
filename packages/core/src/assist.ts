import { msg } from './i18n';
/**
 * AI assist (PRD §45, R17): what a draft can become, and the label everything a model wrote
 * carries. Model output is a suggestion: it is shown with this label and used only on a tap.
 */
export const AI_LABEL = msg('Suggested by Cai');

/** A question about a conversation (R67) is a sentence, not a document. */
export const ASK_MAX = 300;
/** The most Cai says aloud in a call in one go (R114 (3), M17 I13g): a spoken sentence or two. */
export const SPOKEN_MAX = 280;

export const REWRITE_STYLES = ['clearer', 'shorter', 'formal', 'friendly'] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];

export const REWRITE_LABELS: Record<RewriteStyle, string> = {
  clearer: msg('Clearer'),
  shorter: msg('Shorter'),
  formal: msg('More formal'),
  friendly: msg('Friendlier'),
};
