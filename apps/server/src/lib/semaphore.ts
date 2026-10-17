/**
 * So many at once, the rest in line (review 2026-10-17 §4: images were decoded with no bound,
 * so a burst of uploads could take the instance's memory). One for a kind of work, shared by
 * every path that does it; never nested, or two holders waiting on each other never finish.
 */
export class Semaphore {
  private waiting: Array<() => void> = [];

  constructor(private free: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free -= 1;
    else
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    try {
      return await work();
    } finally {
      // The slot passes straight to the next in line, or comes free.
      const next = this.waiting.shift();
      if (next) next();
      else this.free += 1;
    }
  }

  /** How many wait for a slot now (a gauge, a test). */
  get queued(): number {
    return this.waiting.length;
  }
}
