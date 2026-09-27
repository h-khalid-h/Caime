/**
 * The lists beside a conversation on a desktop, which the phone shows as tabs: each loads the
 * first time it's opened, apart from Chats, where every visit starts. Every screen takes them
 * from here, so none is in the first download: one imported directly anywhere would be.
 */
import { ScreenError } from '@/features/common/ScreenError';
import { lazyPart } from '@/ui/Lazy';

// Each is a whole tab or pane: one that can't be shown says so, with a way to try again.
export const PeopleList = lazyPart(
  () => import('@/features/people/PeopleList').then((m) => m.PeopleList),
  ScreenError,
);
export const SpacesList = lazyPart(
  () => import('@/features/spaces/SpacesList').then((m) => m.SpacesList),
  ScreenError,
);
export const SettingsMenu = lazyPart(
  () => import('@/features/settings/SettingsMenu').then((m) => m.SettingsMenu),
  ScreenError,
);
export const BusinessInbox = lazyPart(
  () => import('@/features/business/BusinessInbox').then((m) => m.BusinessInbox),
  ScreenError,
);
