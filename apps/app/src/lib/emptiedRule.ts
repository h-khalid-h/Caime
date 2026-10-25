/**
 * The rule under `lib/emptied.ts`, apart so it can be tested without React Native: a change that
 * arrives into a box just emptied is the keyboard's echo of what went, never typing.
 */
/** How long after a box was emptied a change arriving into it is the keyboard's echo, never typing. */
export const EMPTIED_ECHO_MS = 400;

export function echoesAfterEmpty(args: {
  /** Whether this is a phone (the web's inputs never echo). */
  native: boolean;
  emptiedAt: number;
  now: number;
  /** The value as the state holds it, and the one the field reports. */
  current: string;
  next: string;
}): boolean {
  const { native, emptiedAt, now, current, next } = args;
  // One letter within the moment is someone typing on at once; more than one, nobody's.
  return native && current === '' && next.length > 1 && now - emptiedAt < EMPTIED_ECHO_MS;
}
