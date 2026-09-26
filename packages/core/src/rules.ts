/**
 * Field rules as plain functions, shared by the server's schemas and the clients' forms, so a
 * form says exactly what the server would say, before the request (and without shipping zod).
 * Each returns an error message, or null when the value is fine.
 */

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;
export const HANDLE_RULE = 'Use 3–30 letters, numbers, dots or underscores.';
export const HANDLE_REPEAT_RULE = 'Dots and underscores can’t be next to each other.';

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

export function handleError(value: string): string | null {
  const h = normalizeHandle(value);
  if (!HANDLE_PATTERN.test(h)) return HANDLE_RULE;
  if (/[._]{2}/.test(h)) return HANDLE_REPEAT_RULE;
  return null;
}

/** A handle suggestion from a display name: "Sara Ahmed" → "sara.ahmed". */
export function handleFromName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^[._]+|[._]+$/g, '')
    .replace(/[._]{2,}/g, '.')
    .slice(0, 30)
    .replace(/[._]+$/g, '');
  return base.length >= 3 ? base : '';
}

export const PASSWORD_MIN = 10;

export function passwordError(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > 200) return 'That password is too long.';
  if (new Set(value).size < 5) return 'Use a less repetitive password.';
  return null;
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
    return 'Enter a valid email address.';
  return null;
}

export function displayNameError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your name.';
  if (v.length > 80) return 'Keep your name under 80 characters.';
  return null;
}
