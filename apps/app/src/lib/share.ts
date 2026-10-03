import { tr } from '@caime/core/i18n';
import { Share } from 'react-native';
import { toast } from '@/ui/Toast';
import { copyText } from './clipboard';
import { isWeb } from './config';

/**
 * Share a link with a line of text: the system share sheet where there is one, else (desktop
 * browsers) copy the link and say so, rather than a button that does nothing.
 */
export async function shareLink(text: string, url: string): Promise<void> {
  if (isWeb) {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await copyText(url);
      toast(tr('Link copied'));
    } catch {
      toast(url);
    }
    return;
  }
  // Android shares only the message, so the link goes in it.
  await Share.share({ message: `${text} ${url}` }).catch(() => {});
}
