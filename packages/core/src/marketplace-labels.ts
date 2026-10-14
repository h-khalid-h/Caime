/**
 * What Discover's sheet shows of a listing beside the developer's own screen (R80): how it's paid
 * for and where its page is. Apart from `marketplace.ts` so the sheet, a second screen that reads
 * them, doesn't carry the whole listing's rules into the startup chunk (it did: 1.4 KB minified).
 */
import { msg } from './i18n';

/** How an app is paid for, declared by its developer: Caime never takes the money (R62). */
export const APP_PRICING = ['free', 'freemium', 'trial', 'paid', 'subscription'] as const;
export type AppPricing = (typeof APP_PRICING)[number];
export const APP_PRICING_LABELS: Record<AppPricing, string> = {
  free: msg('Free'),
  freemium: msg('Free and paid plans'),
  trial: msg('Paid, with a free trial'),
  paid: msg('Paid, with no free plan'),
  subscription: msg('Included with a subscription'),
};

/** The marketplace on the web: its page, and each app's (a built-in's and a bridge's by id). */
export const MARKETPLACE_PATH = '/marketplace';
export const marketplacePath = (slug: string) => `${MARKETPLACE_PATH}/${encodeURIComponent(slug)}`;
