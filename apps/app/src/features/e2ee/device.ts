import { tr } from '@caime/core/i18n';
/**
 * A name for this browser's device in Settings: the browser and the system it's on. The phones'
 * is device.native.ts.
 */
export function deviceName(): string {
  if (typeof navigator === 'undefined') return tr('This device');
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : tr('A browser');
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? /iPhone|iPad/.test(ua)
        ? 'iOS'
        : 'Mac'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : null;
  return system ? tr('{browser} on {system}', { browser, system }) : browser;
}
