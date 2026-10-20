/**
 * What a device is called, from its browser: "Chrome · macOS". Product names, never words, so it
 * reads the same in every language; null where the browser says nothing it names. A passkey is
 * named by the browser that made it, and a browser's session by the browser signed in on.
 */
export function deviceNameOf(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const os = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /CrOS/.test(userAgent)
          ? 'ChromeOS'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Windows/.test(userAgent)
              ? 'Windows'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
