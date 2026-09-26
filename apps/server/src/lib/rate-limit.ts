/**
 * Sliding-window rate limits per key, in memory. Enough for one instance; behind several
 * instances each enforces its own share, which still bounds abuse. Keys look like
 * "login:ip:1.2.3.4" or "request:user:<id>".
 */
import { tooMany } from './errors';

interface Window {
  hits: number[];
}

export class RateLimiter {
  private windows = new Map<string, Window>();
  private sweeps = 0;

  /** Throws 429 when `key` exceeded `limit` hits in the last `windowMs`. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): void {
    const w = this.windows.get(key) ?? { hits: [] };
    w.hits = w.hits.filter((t) => t > now - windowMs);
    if (w.hits.length >= limit) {
      const retry = Math.ceil((w.hits[0]! + windowMs - now) / 1000);
      this.windows.set(key, w);
      throw tooMany(Math.max(1, retry));
    }
    w.hits.push(now);
    this.windows.set(key, w);
    if (++this.sweeps % 1000 === 0) this.sweep(now);
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows) {
      if (!w.hits.some((t) => t > now - 3_600_000)) this.windows.delete(key);
    }
  }

  reset(): void {
    this.windows.clear();
  }
}
