/**
 * Puts text on the clipboard, in the browser: asked for while the tap is still going, as browsers
 * want, and the old way where the clipboard API is missing or refused (as expo-clipboard does,
 * without carrying its module in every screen that can copy).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.textContent = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(field);
    }
  }
}
