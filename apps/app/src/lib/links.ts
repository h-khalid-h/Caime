import { router } from 'expo-router';
import { Alert, Linking, Platform } from 'react-native';
import { WEB_URL } from './config';
import { ownLinkPath } from './paths';

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/gi;

export interface TextPart {
  text: string;
  url?: string;
  /** Offset in the source text: a stable key for rendering. */
  start: number;
}

/** Split message text into plain runs and links, so links can be tapped. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const i = match.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), start: last });
    parts.push({ text: match[0], url: match[0], start: i });
    last = i + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), start: last });
  return parts;
}

/** Open a link, asking first when the server flagged it as unusual (link safety, PRD §60). */
/**
 * Open a link whose words the server never checked (a private message, an organization's
 * update): checked here first, the check loaded when a link is first opened.
 */
export async function openCheckedLink(url: string): Promise<void> {
  const { assessLink } = await import('@caishy/core/safety');
  openLink(url, assessLink(url).suspicious);
}

export function openLink(url: string, suspicious = false): void {
  // A link to Caishy itself (someone's @handle) opens here, not in another tab.
  const own = ownLinkPath(url, WEB_URL);
  if (own) {
    router.push(own);
    return;
  }
  const go = () => void Linking.openURL(url).catch(() => {});
  if (!suspicious) {
    go();
    return;
  }
  const message = `This link looks unusual:\n${url}\n\nOpen it only if you trust who sent it.`;
  if (Platform.OS === 'web') {
    if (window.confirm(message)) go();
    return;
  }
  Alert.alert('Open this link?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', style: 'destructive', onPress: go },
  ]);
}
