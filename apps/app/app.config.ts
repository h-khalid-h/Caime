/**
 * app.json, and the Expo project it belongs to when one is set (`EXPO_PROJECT_ID`, on the
 * `caime-go` service in EasyPanel). With it, and `EXPO_TOKEN` for the account that owns it, Expo's
 * server signs what it sends as that account, which Expo Go asks of a project it doesn't reach on
 * the same Wi-Fi (docs/DEPLOY.md, "Expo Go"). Without them, the app is as app.json says.
 *
 * A build that talks to Caime over https (`EXPO_PUBLIC_API_URL`, `https://cai.me` in every EAS
 * profile) claims that domain (R35): its links open the app (`applinks`, Android's verified
 * intent filters, for the paths in `APP_LINK_PATHS`) and its passkeys work in it
 * (`webcredentials`). The server answers for the claim from `/.well-known/` once its
 * `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` are set.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Core's `APP_LINK_PREFIXES`, which this file can't import (`appLinks.test.ts` holds them equal). */
export const APP_LINK_PATHS = ['/@', '/o/', '/c/', '/i/', '/t/', '/s/', '/p/'] as const;

/** The domain a build's links and passkeys belong to: the API's, when it's https. */
export function linkedHost(apiUrl: string | undefined): string | null {
  try {
    const url = new URL(apiUrl ?? '');
    return url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EXPO_PROJECT_ID?.trim();
  const host = linkedHost(process.env.EXPO_PUBLIC_API_URL);
  const base = config as ExpoConfig;
  return {
    ...base,
    ...(projectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } } : {}),
    ...(host
      ? {
          ios: {
            ...base.ios,
            associatedDomains: [`applinks:${host}`, `webcredentials:${host}`],
          },
          android: {
            ...base.android,
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          },
        }
      : {}),
  };
};
