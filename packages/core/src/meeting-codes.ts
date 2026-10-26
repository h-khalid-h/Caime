/**
 * A meeting's short address (M16 F6d): ten letters in the shape of a call's code elsewhere
 * ("hzw-tcsi-hst"), one a card held on Caime, so a calendar shows it on one line where the
 * conversation's own address took four. Letters only, none that reads as another (no l, no o),
 * so it survives being read aloud, typed or lower-cased. Apart from `meetings.ts`, which the
 * first download carries: only the server and the screen a code opens read it.
 */
export const MEETING_CODE_LETTERS = 'abcdefghijkmnpqrstuvwxyz';
export const MEETING_CODE_LENGTH = 10;

/** As it's shown and linked: three letters, four, three. */
export function shownMeetingCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`;
}

/** The code an address holds, however it was written (dashes, capitals), or null. */
export function meetingCodeIn(text: string | null | undefined): string | null {
  const bare = (text ?? '').trim().toLowerCase().replace(/-/g, '');
  if (bare.length !== MEETING_CODE_LENGTH) return null;
  return [...bare].every((c) => MEETING_CODE_LETTERS.includes(c)) ? bare : null;
}

/** Its path on Caime. */
export const meetingCodePath = (code: string): string => `/m/${shownMeetingCode(code)}`;
