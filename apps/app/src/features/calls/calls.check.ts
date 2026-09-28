/**
 * The phones' calls (calls.ts) and the web's (calls.web.ts) offer the same names, each taking
 * what the other does. The typecheck reads the app's imports of calls against calls.ts alone, so
 * a name only there, or one the web takes differently, would pass it and break on the web.
 * Nothing imports this file: it fails the typecheck when the two part ways.
 */
import type * as Phone from './calls';
import type * as Web from './calls.web';

type P = typeof Phone;
type W = typeof Web;
type Parted =
  | Exclude<keyof P, keyof W>
  | Exclude<keyof W, keyof P>
  | { [K in keyof P & keyof W]: W[K] extends P[K] ? (P[K] extends W[K] ? never : K) : K }[keyof P &
      keyof W];
type None<T extends never> = T;
export type CallsAlike = None<Parted>;
