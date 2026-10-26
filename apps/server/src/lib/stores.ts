/**
 * Where Caime is listed (R120): the App Store, Google Play, the Microsoft Store and the desktop
 * app's releases, each from the configuration once its listing is live (`APPLE_APP_ID`,
 * `PLAY_LISTED`, `MICROSOFT_STORE_ID`, `DESKTOP_RELEASES_URL`) and null before, so nothing
 * anywhere offers a store with no listing behind it. `/download`, the phone pages' smart banners
 * and the manifest's related apps all read these, never an address of their own.
 */
import { APP_IDS } from '@caime/core/api';
import type { Config } from '../config';

export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
  microsoftStore: string | null;
  desktop: string | null;
}

type ListingConfig = Pick<
  Config,
  'APPLE_APP_ID' | 'PLAY_LISTED' | 'MICROSOFT_STORE_ID' | 'DESKTOP_RELEASES_URL'
>;

export function storeLinks(config: ListingConfig): StoreLinks {
  return {
    appStore: config.APPLE_APP_ID ? `https://apps.apple.com/app/id${config.APPLE_APP_ID}` : null,
    googlePlay: config.PLAY_LISTED
      ? `https://play.google.com/store/apps/details?id=${APP_IDS.android}`
      : null,
    microsoftStore: config.MICROSOFT_STORE_ID
      ? `https://apps.microsoft.com/detail/${config.MICROSOFT_STORE_ID}`
      : null,
    desktop: config.DESKTOP_RELEASES_URL ?? null,
  };
}

/** The web manifest's `related_applications`: the phone apps once listed. */
export function relatedApplications(config: ListingConfig) {
  const links = storeLinks(config);
  return [
    ...(links.googlePlay ? [{ platform: 'play', url: links.googlePlay, id: APP_IDS.android }] : []),
    ...(links.appStore
      ? [{ platform: 'itunes', url: links.appStore, id: `id${config.APPLE_APP_ID}` }]
      : []),
  ];
}
