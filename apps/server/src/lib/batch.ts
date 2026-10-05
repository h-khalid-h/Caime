/**
 * Run `fn` over `items` with at most `limit` in flight (convention 14): a fan-out to a group
 * writes a few people at a time instead of one query per member all at once on a pool of
 * twenty. Every item is tried; the first failure is thrown once all are done.
 */
export async function eachLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  let failed = false;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        await fn(items[i] as T, i);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw failure;
}
