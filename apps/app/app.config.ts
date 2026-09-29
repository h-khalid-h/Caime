/**
 * app.json, and the Expo project it belongs to when one is set (`EXPO_PROJECT_ID`, on the
 * `caime-go` service in EasyPanel). With it, and `EXPO_TOKEN` for the account that owns it, Expo's
 * server signs what it sends as that account, which Expo Go asks of a project it doesn't reach on
 * the same Wi-Fi (docs/DEPLOY.md, "Expo Go"). Without them, the app is as app.json says.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EXPO_PROJECT_ID?.trim();
  return {
    ...(config as ExpoConfig),
    ...(projectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } } : {}),
  };
};
