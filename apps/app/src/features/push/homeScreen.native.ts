/** A phone's app notifies on its own: nothing to tell (homeScreen.ts is the browser's). */
export function homeScreenHint(): 'iphone' | 'ipad' | null {
  return null;
}

export function dismissHomeScreenHint(): void {}

/** A phone's app is installed already (R120): nothing to offer. */
export const installHintDismissed = (): boolean => true;
export function dismissInstallHint(): void {}
export const INSTALL_AFTER_MS = 2 * 86_400_000;
