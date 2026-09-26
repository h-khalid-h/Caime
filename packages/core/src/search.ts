/**
 * Search query understanding (PRD §25). Turns what people type into a structured query the server
 * executes across people, relationships, organizations, messages, assets, actions and contexts.
 * Deterministic patterns cover the common shapes; with AI enabled, a model can fill the same
 * structure for anything else (R17).
 */
import { relationshipFromWord, type Sphere } from './taxonomy';

export const SEARCH_SCOPES = [
  'all',
  'people',
  'messages',
  'files',
  'links',
  'tasks',
  'waiting',
  'decisions',
  'contexts',
] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'pdf';

export interface ParsedQuery {
  raw: string;
  scope: SearchScope;
  /** Free text to match. */
  text: string;
  /** A person named in the query ("from Sarah", "Sarah said"). */
  person: string | null;
  relationship: { sphere: Sphere; role?: string } | null;
  fileKind: FileKind | null;
  /** For tasks: who asked whom. */
  direction: 'asked_me' | 'i_asked' | null;
  /** How the query was understood, shown under the search box. */
  interpretation: string;
}

const FILE_WORDS: Array<[RegExp, FileKind | null, SearchScope]> = [
  [/^pdfs?$/i, 'pdf', 'files'],
  [/^(documents?|docs?)$/i, 'document', 'files'],
  [/^(photos?|pictures?|pics?|images?)$/i, 'image', 'files'],
  [/^videos?$/i, 'video', 'files'],
  [/^(voice notes?|voice messages?|audio|recordings?)$/i, 'audio', 'files'],
  [/^(files?|attachments?)$/i, null, 'files'],
  [/^links?$/i, null, 'links'],
];

function clean(s: string): string {
  return s
    .trim()
    .replace(/[?.!]+$/, '')
    .trim();
}

function base(raw: string): ParsedQuery {
  return {
    raw,
    scope: 'all',
    text: clean(raw),
    person: null,
    relationship: null,
    fileKind: null,
    direction: null,
    interpretation: '',
  };
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const q = clean(raw);
  const out = base(raw);
  if (!q) return out;

  // "PDFs from Sarah", "photos with Ahmed", "links from DATA C"
  let m = /^(.+?)\s+(?:from|by|with|of)\s+(.+)$/i.exec(q);
  if (m) {
    const file = FILE_WORDS.find(([re]) => re.test(m![1]!.trim()));
    if (file) {
      return {
        ...out,
        scope: file[2],
        fileKind: file[1],
        person: m[2]!.trim(),
        text: '',
        interpretation: `${file[2] === 'links' ? 'Links' : file[1] ? `${m[1]!.trim()}` : 'Files'} from ${m[2]!.trim()}`,
      };
    }
  }
  const fileOnly = FILE_WORDS.find(([re]) => re.test(q));
  if (fileOnly) {
    return {
      ...out,
      scope: fileOnly[2],
      fileKind: fileOnly[1],
      text: '',
      interpretation: `All ${q.toLowerCase()}`,
    };
  }

  // "things Sarah asked me to do", "what did Sarah ask me", "what I asked Sarah"
  m =
    /^(?:things|what|stuff)\s+(.+?)\s+asked\s+me(?:\s+to\s+do|\s+for)?$/i.exec(q) ??
    /^what\s+did\s+(.+?)\s+ask\s+(?:me|me\s+to\s+do|me\s+for)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]!.trim(),
      direction: 'asked_me',
      text: '',
      interpretation: `What ${m[1]!.trim()} asked you to do`,
    };
  }
  m = /^(?:things|what)\s+i\s+asked\s+(.+?)(?:\s+to\s+do|\s+for)?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]!.trim(),
      direction: 'i_asked',
      text: '',
      interpretation: `What you asked ${m[1]!.trim()} to do`,
    };
  }

  // "waiting on Sarah", "what am I waiting for"
  m = /^(?:waiting\s+(?:on|for)|what\s+am\s+i\s+waiting\s+(?:on|for)\s+from)\s+(.+)$/i.exec(q);
  if (m)
    return {
      ...out,
      scope: 'waiting',
      person: m[1]!.trim(),
      text: '',
      interpretation: `What you're waiting for from ${m[1]!.trim()}`,
    };
  if (/^(?:what\s+am\s+i\s+waiting\s+(?:on|for)|waiting)$/i.test(q)) {
    return { ...out, scope: 'waiting', text: '', interpretation: "Everything you're waiting for" };
  }

  // "what did Sarah say about the migration"
  m = /^what\s+did\s+(.+?)\s+(?:say|write|mention|send)\s+(?:about|on|regarding)\s+(.+)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'messages',
      person: m[1]!.trim(),
      text: m[2]!.trim(),
      interpretation: `${m[1]!.trim()} on “${m[2]!.trim()}”`,
    };
  }

  // "decisions about pricing", "decisions"
  m = /^decisions?(?:\s+(?:about|on|for|in|with)\s+(.+))?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'decisions',
      text: m[1]?.trim() ?? '',
      interpretation: m[1] ? `Decisions about “${m[1].trim()}”` : 'All decisions',
    };
  }

  // "tasks", "my tasks", "tasks from Sarah"
  m = /^(?:my\s+)?(?:tasks?|to-?dos?|actions?)(?:\s+(?:from|with|for)\s+(.+))?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]?.trim() ?? null,
      text: '',
      interpretation: m[1] ? `Tasks with ${m[1].trim()}` : 'Your tasks',
    };
  }

  // "Project Alpha conversations"
  m = /^(.+?)\s+(?:conversations?|chats?|threads?|context)$/i.exec(q);
  if (m)
    return {
      ...out,
      scope: 'contexts',
      text: m[1]!.trim(),
      interpretation: `Conversations about “${m[1]!.trim()}”`,
    };

  // "managers", "my customers", "family"
  const rel = relationshipFromWord(q.replace(/^(?:my|all(?:\s+my)?)\s+/i, ''));
  if (rel) {
    return {
      ...out,
      scope: 'people',
      relationship: rel,
      text: '',
      interpretation: `People you classified as ${q.replace(/^(?:my|all(?:\s+my)?)\s+/i, '').toLowerCase()}`,
    };
  }

  // "from Sarah: proposal", "proposal from Sarah"
  m = /^(.+?)\s+from\s+(.+)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'messages',
      person: m[2]!.trim(),
      text: m[1]!.trim(),
      interpretation: `“${m[1]!.trim()}” from ${m[2]!.trim()}`,
    };
  }

  return { ...out, interpretation: `Everything matching “${q}”` };
}
