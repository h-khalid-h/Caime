/** A phone's app notifies on its own: nothing to tell (homeScreen.ts is the browser's). */
export function homeScreenHint(): 'iphone' | 'ipad' | null {
  return null;
}

export function dismissHomeScreenHint(): void {}
