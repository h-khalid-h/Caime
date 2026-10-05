/**
 * How the speech bake-off scores a transcript (docs/SPEECH.md): the word error rate after
 * normalizing the way a reader hears Arabic, so a spelling choice isn't an error. Pure, so a
 * test can hold it (apps/server/test/speech-wer.test.ts).
 */

/** Words as a reader hears them, so a spelling choice isn't an error. */
export function normalize(text) {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '') // tashkeel and tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate: edits to turn the hypothesis into the reference, over the reference's words. */
export function wer(reference, hypothesis) {
  const r = normalize(reference);
  const h = normalize(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1),
      );
  return r.length ? d[r.length][h.length] / r.length : h.length ? 1 : 0;
}
