/**
 * The app's claim on its domain (R35, `app.config.ts`) matches what the server answers for it: the
 * same link paths as core's list, the same ids as app.json, and a claim only on https.
 */
import { APP_IDS, APP_LINK_PREFIXES } from '@caime/core/api';
import { afterEach, describe, expect, it } from 'vitest';
import makeConfig, { APP_LINK_PATHS, linkedHost } from '../../app.config';
import appJson from '../../app.json';

const before = process.env.EXPO_PUBLIC_API_URL;
afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = before;
});
const config = () =>
  makeConfig({
    config: appJson.expo,
    projectRoot: '',
    staticConfigPath: null,
    packageJsonPath: null,
  } as never);

describe('app links', () => {
  it('open the same paths the server lists, for the app app.json names', () => {
    expect([...APP_LINK_PATHS]).toEqual([...APP_LINK_PREFIXES]);
    expect(appJson.expo.ios.bundleIdentifier).toBe(APP_IDS.ios);
    expect(appJson.expo.android.package).toBe(APP_IDS.android);
  });

  it('claim the https domain the build talks to, links and passkeys', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://cai.me';
    const c = config();
    expect(c.ios?.associatedDomains).toEqual(['applinks:cai.me', 'webcredentials:cai.me']);
    expect(c.ios?.bundleIdentifier).toBe(APP_IDS.ios);
    const filter = c.android?.intentFilters?.[0];
    expect(filter?.autoVerify).toBe(true);
    expect(filter?.data).toEqual(
      APP_LINK_PREFIXES.map((pathPrefix) => ({ scheme: 'https', host: 'cai.me', pathPrefix })),
    );
    expect(c.android?.package).toBe(APP_IDS.android);
  });

  it('claim nothing for a local or unset address', () => {
    expect(linkedHost('http://localhost:8787')).toBeNull();
    expect(linkedHost(undefined)).toBeNull();
    expect(linkedHost('not a url')).toBeNull();
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.4:8787';
    expect(config().ios?.associatedDomains).toBeUndefined();
  });
});
