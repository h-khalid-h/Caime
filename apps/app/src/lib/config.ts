import { Platform } from 'react-native';

/**
 * Where the API lives. The production web app is served by the API server itself, so it uses the
 * same origin (cookies stay first-party). Native apps and the Expo dev server need a full URL.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Expo's dev server (8081) talks to the local API on 8787.
    if (port === '8081' || port === '19006') return `${protocol}//${hostname}:8787`;
    return '';
  }
  return 'http://localhost:8787';
}

export const API_URL = resolveApiUrl();
/** Where links to Caishy point: the web app is served from the API's origin. */
export const WEB_URL = API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
export const WS_URL = WEB_URL.replace(/^http/, 'ws');
export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

/** A person's or an organization's link (handles are one namespace). */
export const handleLink = (handle: string) => `${WEB_URL}/@${handle}`;
