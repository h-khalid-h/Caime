/**
 * Whether private conversations open on this device (R18), without loading what opens them. The
 * phone apps keep their keys in the Keychain or Keystore (keystore.ts) and encrypt in JavaScript
 * (crypto.ts), with the secure randomness `lib/polyfills` gives them.
 */
export const privateSupported: boolean = typeof globalThis.crypto?.getRandomValues === 'function';
