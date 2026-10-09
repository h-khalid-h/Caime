/**
 * Apps (R74): what someone connects to Caime and what they can discover. Connected is
 * everything that acts for them or reads their data, each the same kind of row whatever it is:
 * an app a developer registered (an OAuth grant), or one of Caime's own built-ins (the calendar
 * address). Discover is a directory of the apps developers listed, reviewed once by the operator,
 * paged by keyset and searched by name, so it carries thousands the way the inbox carries
 * conversations. Pure: the app reads it by subpath.
 */
import { msg } from './i18n';

export const APP_CATEGORIES = [
  'calendars',
  'tasks',
  'money',
  'health',
  'travel',
  'work',
  'developer',
  'other',
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

/** Each category as Discover names it (keys: show them through `tr`). */
export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  calendars: msg('Calendars'),
  tasks: msg('Tasks and notes'),
  money: msg('Money'),
  health: msg('Health'),
  travel: msg('Travel'),
  work: msg('Work'),
  developer: msg('Developer tools'),
  other: msg('Other'),
};

/** What a listing says of itself. */
export const APP_TAGLINE_MAX = 80;
export const APP_DESCRIPTION_MAX = 1000;
/** A page of Discover: as updates and assets page. */
export const DIRECTORY_PAGE = 20;
export const DIRECTORY_PAGE_MAX = 50;

/**
 * Where a listing stands: nothing asked, waiting for the operator's look, listed, or declined
 * (the developer can ask again after changing it).
 */
export const LISTING_STATES = ['none', 'waiting', 'listed', 'declined'] as const;
export type ListingState = (typeof LISTING_STATES)[number];

/**
 * Caime's own apps, in Discover beside everyone else's and in Connected when they're on: each
 * connects and disconnects through its own routes, and the directory lists them first. A new
 * built-in (a mail connector, a calendar sync) is a row here and a case where the server says
 * whether it's on.
 */
export const BUILTIN_APPS = [
  {
    id: 'calendar',
    name: msg('Your calendar'),
    tagline: msg('Your due actions and meetings in Google Calendar, Outlook or Apple Calendar'),
    description: msg(
      'A private address your calendar app reads: your actions with a due date, and the meetings and appointments you agreed to. Nothing changes in Caime from there. Anyone with the address sees them, so keep it to yourself.',
    ),
    category: 'calendars',
  },
] as const satisfies readonly {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
}[];
export type BuiltinAppId = (typeof BUILTIN_APPS)[number]['id'];

export const isBuiltinApp = (id: string): id is BuiltinAppId =>
  BUILTIN_APPS.some((a) => a.id === id);

/**
 * Where Discover pages from: how many connected it and its id, since the directory is ordered
 * by those (the most connected first, then the newest), and a cursor names a row exactly.
 */
export function directoryCursor(connectedCount: number, id: string): string {
  return `${connectedCount}.${id}`;
}

export function parseDirectoryCursor(
  cursor: string,
): { connectedCount: number; id: string } | null {
  const m = /^(\d{1,9})\.([0-9a-f-]{36})$/.exec(cursor);
  return m ? { connectedCount: Number(m[1]), id: m[2] as string } : null;
}

/** Where an app's icon is served, for the app and the operator alike; `v` changes with the icon. */
export function appIconPath(appId: string, iconFileId: string | null): string | null {
  return iconFileId ? `/v1/directory/${appId}/icon?v=${iconFileId.slice(-8)}` : null;
}
