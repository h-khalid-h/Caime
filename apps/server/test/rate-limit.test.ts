import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors';
import { RateLimiter } from '../src/lib/rate-limit';

describe('rate limits', () => {
  it('allow up to the limit in the window, then refuse with a retry time', () => {
    const limiter = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) limiter.hit('login:ip:1.2.3.4', 3, 60_000, t0 + i);
    let refused: unknown;
    try {
      limiter.hit('login:ip:1.2.3.4', 3, 60_000, t0 + 10);
    } catch (e) {
      refused = e;
    }
    expect(refused).toBeInstanceOf(AppError);
    expect(refused).toMatchObject({ status: 429, code: 'rate_limited' });
    expect((refused as AppError).details).toMatchObject({ retryAfterSeconds: 60 });
  });

  it('forget hits once they leave the window, and keep keys apart', () => {
    const limiter = new RateLimiter();
    const t0 = 5_000_000;
    limiter.hit('send:a', 1, 1000, t0);
    expect(() => limiter.hit('send:a', 1, 1000, t0 + 500)).toThrow();
    expect(() => limiter.hit('send:b', 1, 1000, t0 + 500)).not.toThrow();
    expect(() => limiter.hit('send:a', 1, 1000, t0 + 1001)).not.toThrow();
  });
});
