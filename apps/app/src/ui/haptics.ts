/** A tap felt on a phone (the web's is `haptics.web.ts`, which feels nothing and loads nothing). */
import * as Haptics from 'expo-haptics';

export const selection = (): void => void Haptics.selectionAsync().catch(() => {});
