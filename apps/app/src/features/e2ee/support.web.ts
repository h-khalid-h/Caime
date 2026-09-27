/**
 * Whether private conversations open in this browser (R18), without loading what opens them: it
 * keeps keys in IndexedDB and works them with Web Crypto.
 */
export const privateSupported: boolean =
  typeof indexedDB !== 'undefined' && Boolean(globalThis.crypto?.subtle);
