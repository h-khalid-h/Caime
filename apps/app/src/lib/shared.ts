/**
 * What another app shared into Caime (R120, the installed web app's share target), as the one
 * message it becomes: its title, its text and its link, each said once (Android puts the link in
 * the text too, and a page's title is often its text's first line), in that order.
 */
export function sharedWords(shared: { title?: string; text?: string; url?: string }): string {
  const parts = [shared.title, shared.text, shared.url]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  return parts
    .filter(
      (s, i) => !parts.some((other, j) => j !== i && other.includes(s) && (other !== s || j < i)),
    )
    .join('\n');
}
