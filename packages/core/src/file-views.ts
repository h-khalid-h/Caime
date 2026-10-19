/**
 * Files read as pages (M16 H6): a Word document, a workbook, a deck, a list of values or plain
 * words, which the server draws as a page of what they hold, so a browser shows what's in one
 * without a viewer of its own or a third party reading it (`FileView.viewUrl`). And what a link
 * to one of someone's own files may be: who opens it, for how long, how many at once. Light: the
 * server reads both, and the app the link's choices.
 */

export const VIEW_KINDS = ['docx', 'xlsx', 'pptx', 'csv', 'text'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/** The most of a file read for its page: past it, the file is a download alone. */
export const VIEW_MAX_BYTES = 20 * 1024 * 1024;

const VIEW_MIMES: Record<string, ViewKind> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'text',
  'text/markdown': 'text',
};

const VIEW_ENDINGS: Record<string, ViewKind> = {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  csv: 'csv',
  txt: 'text',
  md: 'text',
  markdown: 'text',
};

/**
 * Whether a file is one the server reads as a page, by its type, else (a type a device didn't
 * know, `application/octet-stream`) its name's ending; and which kind.
 */
export function viewKindOf(mime: string, name: string): ViewKind | null {
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const byType = VIEW_MIMES[type];
  if (byType) return byType;
  if (type && type !== 'application/octet-stream' && type !== 'application/zip') return null;
  const ending = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  return VIEW_ENDINGS[ending] ?? null;
}

/**
 * Whether a file is read as a page at all: an Office file up to `VIEW_MAX_BYTES`, words or a list
 * of values of any length (their start is read, and the page says where it stops).
 */
export function viewable(mime: string, name: string, size: number): boolean {
  const kind = viewKindOf(mime, name);
  return kind !== null && (kind === 'csv' || kind === 'text' || size <= VIEW_MAX_BYTES);
}

/** Who opens a link to a file: anyone who has it, or only someone signed in to Caime. */
export const FILE_LINK_AUDIENCES = ['anyone', 'caime'] as const;
export type FileLinkAudience = (typeof FILE_LINK_AUDIENCES)[number];

/** How long a link stays open, in days: a day, a week, a month; never for good. */
export const FILE_LINK_DAYS = [1, 7, 30] as const;
export type FileLinkDays = (typeof FILE_LINK_DAYS)[number];
export const FILE_LINK_DEFAULT_DAYS: FileLinkDays = 7;

/** Links open at once to one file. */
export const FILE_LINKS_OPEN = 5;
