/**
 * A mail's words as a conversation shows them (R75): what the person wrote, without the marks a
 * mail client's plain-text copy adds for its own HTML (Gmail writes bold as `*bold*`) and with the
 * signature set apart, so a thread of mails reads as a chat and not as one signature after
 * another. Pure: the server reads every mail in through it.
 */

export interface MailText {
  body: string;
  /** The signature cut from the end of the body, or null when none was found. */
  signature: string | null;
}

/** At most this many lines at the end of a mail are ever taken as its signature. */
const SIGNATURE_LINES_MAX = 15;

/** An HTML fragment as lines of words: tags out, entities read, blank lines kept single. */
function htmlLines(html: string): string[] {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A line as it's compared: no emphasis marks, no spacing, no case. */
const norm = (line: string): string =>
  line.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Gmail's and Outlook's plain-text copy write emphasis as `*words*`. Taken out only when the mail's
 * HTML has emphasis of its own, so someone who types asterisks keeps them.
 */
function withoutEmphasisMarks(text: string, html: string | null): string {
  if (!html || !/<(b|strong|i|em)[\s>]/i.test(html)) return text;
  return text.replace(/(^|[\s(|])\*([^*\n]{1,200}?)\*(?=[\s.,;:!?)|]|$)/gm, '$1$2');
}

/** The signature block a client marks in its HTML: Gmail's `gmail_signature`, Outlook's `Signature`. */
function markedSignature(html: string | null): string[] {
  if (!html) return [];
  const at = html.search(/<div[^>]*(class="[^"]*gmail_signature|id="Signature")/i);
  if (at < 0) return [];
  // Up to the quoted mail, when there's one after it.
  const rest = html.slice(at);
  const quote = rest.search(
    /<(div[^>]*class="[^"]*gmail_quote|blockquote|div[^>]*id="divRplyFwdMsg")/i,
  );
  return htmlLines(quote < 0 ? rest : rest.slice(0, quote)).slice(0, SIGNATURE_LINES_MAX);
}

/** Where `tail` (lines to find, in order) starts at the end of `lines`, or -1. */
function endsWith(lines: string[], tail: string[]): number {
  const want = tail.map(norm).filter(Boolean);
  if (want.length === 0) return -1;
  const have = lines.map(norm);
  // The body's last lines that aren't blank, matched from the end.
  let i = have.length - 1;
  let j = want.length - 1;
  while (i >= 0 && have[i] === '') i--;
  const last = i;
  while (i >= 0 && j >= 0) {
    if (have[i] === '') {
      i--;
      continue;
    }
    if (have[i] !== want[j]) return -1;
    i--;
    j--;
  }
  return j < 0 && last >= 0 ? i + 1 : -1;
}

/**
 * The words of a mail and its signature apart. The signature is what follows a "-- " line, else
 * the block the HTML marks as one, else the lines the same sender's previous mail ended its
 * signature with; a mail that is nothing but a signature keeps its words.
 */
export function mailText(
  text: string,
  html: string | null,
  previousSignature: string | null = null,
): MailText {
  const clean = withoutEmphasisMarks(text.replace(/\r\n/g, '\n'), html);
  let lines = clean.split('\n').map((l) => l.replace(/\s+$/, ''));
  let signature: string[] | null = null;
  const dash = lines.findIndex((l) => l === '-- ' || l === '--');
  if (dash > 0 && lines.length - dash - 1 <= SIGNATURE_LINES_MAX) {
    signature = lines.slice(dash + 1);
    lines = lines.slice(0, dash);
  } else {
    // A previous signature of one line ("Thanks") is too common to cut by.
    const before = previousSignature?.split('\n').filter((l) => l.trim()) ?? [];
    for (const tail of [markedSignature(html), before.length >= 2 ? before : []]) {
      const at = endsWith(lines, tail);
      if (at > 0) {
        signature = lines.slice(at);
        lines = lines.slice(0, at);
        break;
      }
    }
  }
  const body = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sig = signature
    ?.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!body) return { body: clean.replace(/\n{3,}/g, '\n\n').trim(), signature: null };
  return { body, signature: sig || null };
}

/**
 * The closing lines two mails from the same sender share (R75), at least two of them that aren't
 * blank, as a signature to fold: how mail received before signatures were set apart is cleaned.
 * Null when they end differently, or when one of them is nothing else.
 */
export function sharedTail(a: string, b: string): string | null {
  const lines = (t: string) =>
    t
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  const x = lines(a);
  const y = lines(b);
  let n = 0;
  while (
    n < Math.min(x.length, y.length) &&
    norm(x[x.length - 1 - n] ?? '') === norm(y[y.length - 1 - n] ?? '')
  )
    n++;
  n = Math.min(n, SIGNATURE_LINES_MAX);
  // Two lines at least, and words of their own left in both.
  if (n < 2 || n >= x.length || n >= y.length) return null;
  return x.slice(x.length - n).join('\n');
}

/** A signature's own emphasis marks out (`*Name*`), for one cut from plain text. */
export function signatureWithoutMarks(signature: string): string {
  return signature.replace(/(^|[\s(|])\*([^*\n]{1,200}?)\*(?=[\s.,;:!?)|]|$)/gm, '$1$2');
}
