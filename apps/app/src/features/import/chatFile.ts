/**
 * The chat in the .zip an iPhone's "Export chat" makes (M16 C3g): its `_chat.txt`, else the
 * first text file in it, unzipped here on the device. The unzipper loads only when a zip is
 * picked, and inflates the text alone, never the photos an export with media carries.
 */

/** Bigger than any chat's text (20,000 long messages are a few megabytes): a zip saying more lies. */
const CHAT_MAX_BYTES = 40 * 1024 * 1024;

/** Whether a picked file is a zip, by its name or its type. */
export const isZipFile = (name: string, mimeType?: string | null): boolean =>
  /\.zip$/i.test(name) || /zip/i.test(mimeType ?? '');

/** The export's text, or null for a zip with no chat in it, or bytes that aren't a zip at all. */
export async function chatFromZip(bytes: Uint8Array): Promise<string | null> {
  const { strFromU8, unzipSync } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => /\.txt$/i.test(f.name) && f.originalSize <= CHAT_MAX_BYTES,
    });
  } catch {
    return null;
  }
  const names = Object.keys(files);
  const name = names.find((n) => /(^|\/)_chat\.txt$/i.test(n)) ?? names[0];
  const data = name ? files[name] : undefined;
  return data ? strFromU8(data) : null;
}
