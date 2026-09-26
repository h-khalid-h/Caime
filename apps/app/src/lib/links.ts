import { Alert, Linking, Platform } from 'react-native';

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
export function openLink(url: string, suspicious = false): void {
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
