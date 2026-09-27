/**
 * The phone apps get their pushes through Expo (not built into this file); these keep the same
 * shape as webPush.web.ts so shared code needn't know.
 */
export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';
export const webPushSupported = false;
export const pushState = (): PushState => 'unsupported';
export async function enableWebPush(): Promise<PushState> {
  return 'unsupported';
}
export async function resumeWebPush(): Promise<void> {}
export async function disableWebPush(): Promise<void> {}
export async function webPushOn(): Promise<boolean> {
  return false;
}
export function onOpenFromNotification(_go: (path: string) => void): () => void {
  return () => {};
}
