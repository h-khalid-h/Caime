/**
 * UUIDv7: time-ordered ids (docs/ARCHITECTURE.md ADR-8). The first 48 bits are the Unix time in
 * milliseconds, so ids sort by creation time and index well. Uses `crypto.getRandomValues`,
 * available in Node, browsers and (polyfilled) React Native.
 */

let lastMs = 0;
let counter = 0;

function random(bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function uuidv7(now: number = Date.now()): string {
  // Monotonic within a millisecond: a 12-bit counter in rand_a keeps ids ordered.
  if (now === lastMs) counter = (counter + 1) & 0xfff;
  else {
    lastMs = now;
    counter = random(2).reduce((a, b) => (a << 8) | b, 0) & 0x7ff;
  }
  const bytes = random(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A random v4 UUID, for client-side idempotency keys. */
export function uuidv4(): string {
  const bytes = random(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Milliseconds encoded in a v7 id. */
export function uuidv7Time(id: string): number {
  return Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
