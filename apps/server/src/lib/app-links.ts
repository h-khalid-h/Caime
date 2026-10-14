/**
 * The phone apps' claim on this domain (R35): which links open the installed app, and that the
 * app may use the passkeys made here (webcredentials, `get_login_creds`). Apple reads
 * `apple-app-site-association`, Android `assetlinks.json`, both from `/.well-known/` on
 * `PUBLIC_URL`'s name; each is written from the configuration alone (the team id, the signing
 * certificates), and with none of it there is no claim and links open in the browser.
 */
import { APP_IDS, APP_LINK_PREFIXES } from '@caime/core/api';
import type { Config } from '../config';

export function appleAppSiteAssociation(config: Pick<Config, 'APPLE_TEAM_ID'>) {
  if (!config.APPLE_TEAM_ID) return null;
  const app = `${config.APPLE_TEAM_ID}.${APP_IDS.ios}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [app],
          components: APP_LINK_PREFIXES.map((prefix) => ({ '/': `${prefix}*` })),
        },
      ],
    },
    webcredentials: { apps: [app] },
  };
}

export function assetLinks(config: Pick<Config, 'ANDROID_CERT_SHA256'>) {
  const prints = (config.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (!prints.length) return null;
  return [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: APP_IDS.android,
        sha256_cert_fingerprints: prints,
      },
    },
  ];
}
