/**
 * One small cache for what repeats (review 2026-10-09 M26): a value kept for a while, at most
 * so many of them, the oldest let go first. Four modules each wrote their own map with a
 * ceiling (or none, the brief's summaries); this is the one they share. In memory, per
 * instance: anything that must be the same on every instance belongs in the database.
 */
export class TtlCache<K, V> {
  private readonly kept = new Map<K, { value: V; until: number }>();

  constructor(
    /** How many to keep: past it, the oldest entry goes (expired ones first). */
    private readonly max: number,
    /** How long an entry stands, unless `set` says otherwise. */
    private readonly ttlMs: number,
  ) {}

  /** The value kept under `key`, if it's still good at `now`. */
  get(key: K, now = Date.now()): V | undefined {
    const hit = this.kept.get(key);
    if (!hit) return undefined;
    if (hit.until <= now) {
      this.kept.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /** Keep `value` under `key` from `now`, for `ttlMs` (Infinity: until it's pushed out). */
  set(key: K, value: V, now = Date.now(), ttlMs = this.ttlMs): void {
    this.kept.delete(key);
    if (this.kept.size >= this.max) {
      for (const [k, v] of this.kept) if (v.until <= now) this.kept.delete(k);
      if (this.kept.size >= this.max) this.kept.delete(this.kept.keys().next().value as K);
    }
    this.kept.set(key, { value, until: now + ttlMs });
  }

  delete(key: K): void {
    this.kept.delete(key);
  }

  clear(): void {
    this.kept.clear();
  }

  get size(): number {
    return this.kept.size;
  }
}
