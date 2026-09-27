import * as Clipboard from 'expo-clipboard';

/** Puts text on the clipboard. On the web it's clipboard.web.ts, without the module. */
export function copyText(text: string): Promise<boolean> {
  return Clipboard.setStringAsync(text);
}
