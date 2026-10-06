/**
 * A sentence with words in it that do something (a link), kept as one key: the words are marked
 * by a tag (`you agree to the <terms>terms</terms>`), so each language places them where its
 * grammar does, and this cuts the translated sentence into its parts for whoever draws it (the
 * app's links, the server's anchors). Pure: no zod, so the app takes it by subpath.
 */
export type TaggedPart = string | { tag: string; text: string };

export function tagged(text: string): TaggedPart[] {
  const parts: TaggedPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/<(\w+)>(.*?)<\/\1>/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ tag: m[1] ?? '', text: m[2] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The tags a sentence carries, in order: a translation keeps the same ones. */
export function tagsOf(text: string): string[] {
  return tagged(text).flatMap((p) => (typeof p === 'string' ? [] : [p.tag]));
}
