import { describe, expect, it } from 'vitest';
import { FILE_LINK_DAYS, FILE_LINK_DEFAULT_DAYS, viewKindOf } from './file-views';
import { FileLinkBody } from './schemas';

describe('files read as pages (M16 H6)', () => {
  it('knows an Office file, a list of values and plain words by their type', () => {
    expect(
      viewKindOf(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Contract.docx',
      ),
    ).toBe('docx');
    expect(
      viewKindOf('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x'),
    ).toBe('xlsx');
    expect(
      viewKindOf('application/vnd.openxmlformats-officedocument.presentationml.presentation', ''),
    ).toBe('pptx');
    expect(viewKindOf('text/csv; charset=utf-8', 'list.csv')).toBe('csv');
    expect(viewKindOf('text/plain', 'notes.txt')).toBe('text');
    expect(viewKindOf('text/markdown', 'README.md')).toBe('text');
  });

  it('reads the name only where a device didn’t know the type', () => {
    expect(viewKindOf('application/octet-stream', 'Price list.XLSX')).toBe('xlsx');
    expect(viewKindOf('', 'deck.pptx')).toBe('pptx');
    expect(viewKindOf('application/zip', 'letter.docx')).toBe('docx');
    expect(viewKindOf('application/octet-stream', 'notes.md')).toBe('text');
    // A type of its own wins over a name: a picture called .docx is still a picture.
    expect(viewKindOf('image/png', 'not-really.docx')).toBeNull();
    expect(viewKindOf('application/pdf', 'scan.pdf')).toBeNull();
    expect(viewKindOf('application/octet-stream', 'old.doc')).toBeNull();
    expect(viewKindOf('application/octet-stream', 'no-ending')).toBeNull();
  });

  it('takes a link for a day, a week or a month, a week unless told', () => {
    expect(FileLinkBody.parse({})).toEqual({ audience: 'anyone', days: FILE_LINK_DEFAULT_DAYS });
    for (const days of FILE_LINK_DAYS)
      expect(FileLinkBody.parse({ audience: 'caime', days })).toEqual({ audience: 'caime', days });
    expect(FileLinkBody.safeParse({ days: 365 }).success).toBe(false);
    expect(FileLinkBody.safeParse({ audience: 'everyone' }).success).toBe(false);
  });
});
