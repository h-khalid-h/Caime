import type { ReactNode } from 'react';

/**
 * On a phone the layout's direction is the app's own (`I18nManager`): nothing to tell a subtree.
 * The web's version (`Direction.web.tsx`) tells react-native-web, which otherwise lays every
 * `start` and `end` out left to right whatever the document says.
 */
export function Direction({ children }: { children: ReactNode }) {
  return children;
}
