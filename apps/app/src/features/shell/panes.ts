/**
 * The lists beside a conversation on a desktop, which the phone shows as tabs: each loads the
 * first time it's opened, apart from Chats, where every visit starts. Every screen takes them
 * from here, so none is in the first download: one imported directly anywhere would be.
 */
import { lazyPart } from '@/ui/Lazy';

export const PeopleList = lazyPart(() =>
  import('@/features/people/PeopleList').then((m) => m.PeopleList),
);
export const SpacesList = lazyPart(() =>
  import('@/features/spaces/SpacesList').then((m) => m.SpacesList),
);
export const SettingsMenu = lazyPart(() =>
  import('@/features/settings/SettingsMenu').then((m) => m.SettingsMenu),
);
export const BusinessInbox = lazyPart(() =>
  import('@/features/business/BusinessInbox').then((m) => m.BusinessInbox),
);
