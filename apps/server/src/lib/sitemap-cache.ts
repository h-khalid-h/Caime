/**
 * The sitemap, built once and kept ten minutes (review 2026-10-09 M27: every crawl read every
 * verified organization with its whole catalog). Forgotten by what changes it: an offer saved,
 * a domain verified or let go, an organization closed; another instance's copy waits out the
 * ten minutes, which a crawler doesn't mind.
 */
import { TtlCache } from './ttl-cache';

const SITEMAP_MS = 10 * 60_000;
export const sitemaps = new TtlCache<string, string>(4, SITEMAP_MS);

export function forgetSitemaps(): void {
  sitemaps.clear();
}
