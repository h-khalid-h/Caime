/**
 * Notifications on this device, where it's neither a browser (push.web.ts) nor a phone
 * (push.native.ts): the tests' node. The same shape as both, so shared code needn't know.
 */
export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';
export const pushSupported = false;
export const pushState = (): PushState => 'unsupported';
export async function enablePush(): Promise<PushState> {
  return 'unsupported';
}
export async function resumePush(): Promise<void> {}
export async function disablePush(): Promise<void> {}
export async function closeShownNotifications(_ids: string[] | null): Promise<void> {}
export async function leaveThisDevice(_opts: { tellServer: boolean }): Promise<void> {}
export async function pushOn(): Promise<boolean> {
  return false;
}
export function onOpenFromNotification(_go: (path: string) => void): () => void {
  return () => {};
}
