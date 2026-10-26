/**
 * A phone's app (R120): installed already, its icon's count comes with its pushes, and it says
 * which phone it runs on once a launch, for product metrics' count of who uses an installed app.
 */
import type { OkResponse, Surface } from '@caime/core/api';
import { Platform } from 'react-native';
import { api } from '@/api/client';

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
export function tellSurface(): void {
  const surface: Surface = Platform.OS === 'ios' ? 'ios' : 'android';
  void api.put<OkResponse>('/auth/sessions/current/surface', { surface }).catch(() => {});
}
