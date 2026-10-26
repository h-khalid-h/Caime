/**
 * Caime installed from a browser (installed.web.ts, R120): a phone app is installed already, and
 * its icon's count comes with its pushes. The same shape, so shared code needn't know.
 */
export const installedHere = (): boolean => true;
export const installOffer = (): 'prompt' | 'dock' | null => null;
export function onInstallOffer(_heard: () => void): () => void {
  return () => {};
}
export async function install(): Promise<boolean> {
  return false;
}
export function watchBadge(): () => void {
  return () => {};
}
export function tellSurface(): void {}
