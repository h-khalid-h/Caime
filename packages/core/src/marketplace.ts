/**
 * The marketplace (R80): what a listing says beyond R74's tagline and category, and the words
 * the marketplace and Discover's sheet show of it. Pure and light: the Developer screen takes it by
 * subpath (`@caime/core/marketplace`), Discover's sheet only its labels and path
 * (`marketplace-labels.ts`), so neither carries it into the startup chunk, and the server renders
 * the public pages from it.
 */
import { INTERFACE_LANGUAGES, type InterfaceLanguage } from './i18n';

export {
  APP_PRICING,
  APP_PRICING_LABELS,
  type AppPricing,
  MARKETPLACE_PATH,
  marketplacePath,
} from './marketplace-labels';

/** The languages an app says it works in: Caime's own, so a reader knows it speaks theirs. */
export const APP_LANGUAGES: readonly InterfaceLanguage[] = INTERFACE_LANGUAGES;

/** Up to five screenshots, 8:5, wide enough for the preview rendition (R70) to be sharp. */
export const APP_SCREENSHOTS_MAX = 5;
export const SCREENSHOT_RATIO = 8 / 5;
/** How far from 8:5 a screenshot may be (a crop a pixel off still reads as 8:5). */
export const SCREENSHOT_RATIO_SLACK = 0.02;
export const SCREENSHOT_MIN_WIDTH = 1280;

/**
 * When an app puts a person's words through a model, what it says of it (R80): which model,
 * what it keeps and for how long, and where. Shown on its page as the processors list is.
 */
export interface AiUse {
  model: string;
  keeps: string;
  /** Days it keeps them; 0 when nothing is kept past the answer. */
  days: number;
  where: string;
}
export const AI_USE_TEXT_MAX = 200;
export const AI_USE_DAYS_MAX = 3650;

/**
 * What the operator checks before letting a listing through (R80): every one, each time a
 * listing asks. The keys travel with the review; their meaning is in docs/API.md and DEPLOY.md.
 */
export const LISTING_CHECKS = ['permissions', 'connect', 'pages', 'conduct'] as const;
export type ListingCheck = (typeof LISTING_CHECKS)[number];

/**
 * Where an app's screenshot is served (R80): `n` its place, `v` the file, so a browser keeps it
 * until it changes. The operator reads the same through `/v1/admin/listings/…`.
 */
export const appScreenshotPath = (appId: string, n: number, fileId: string, admin = false) =>
  `/v1/${admin ? 'admin/listings' : 'directory'}/${appId}/screenshots/${n}?v=${fileId.slice(-8)}`;

/**
 * An app's address in the marketplace, from its name: Latin letters and digits, the rest a
 * hyphen, at most 48 characters. Null when nothing Latin is left (a name in Arabic), and the
 * server gives the app an address of its own then. Held once given, like a handle.
 */
export function slugFromName(name: string): string | null {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : null;
}

/** Whether a support address is one people can reach: a page (https) or mail. */
export const isSupportAddress = (url: string) => /^(https:\/\/|mailto:)\S+$/i.test(url.trim());
