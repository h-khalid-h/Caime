/**
 * Which device a page is read on, from the browser's own user agent (R120): what `/download`
 * leads with, never anything kept or counted. An iPad asking for the desktop site says it's a Mac,
 * and is answered as one; the other devices' ways are on the page too.
 */
export const DEVICES = [
  'iphone',
  'ipad',
  'android',
  'windows',
  'mac',
  'linux',
  'chromeos',
] as const;
export type Device = (typeof DEVICES)[number] | 'other';

export function deviceOf(userAgent: string | string[] | undefined): Device {
  const ua = Array.isArray(userAgent) ? (userAgent[0] ?? '') : (userAgent ?? '');
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/iPad/.test(ua)) return 'ipad';
  if (/Android/.test(ua)) return 'android';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Windows NT/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Linux|X11/.test(ua)) return 'linux';
  return 'other';
}
