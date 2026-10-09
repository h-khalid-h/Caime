import { describe, expect, it } from 'vitest';
import {
  APP_CATEGORIES,
  APP_CATEGORY_LABELS,
  appIconPath,
  BUILTIN_APPS,
  directoryCursor,
  isBuiltinApp,
  parseDirectoryCursor,
} from './app-directory';

describe('the app directory (R74)', () => {
  it('names every category, and the built-ins each have one', () => {
    for (const c of APP_CATEGORIES) expect(APP_CATEGORY_LABELS[c]).toBeTruthy();
    for (const b of BUILTIN_APPS) expect(APP_CATEGORIES).toContain(b.category);
    expect(isBuiltinApp('calendar')).toBe(true);
    expect(isBuiltinApp('0191d1a2-0000-7000-8000-000000000000')).toBe(false);
  });

  it('pages by count then id, and reads only a cursor it wrote', () => {
    const id = '0191d1a2-0000-7000-8000-000000000000';
    expect(parseDirectoryCursor(directoryCursor(42, id))).toEqual({ connectedCount: 42, id });
    expect(parseDirectoryCursor('42')).toBeNull();
    expect(parseDirectoryCursor(`-1.${id}`)).toBeNull();
    expect(parseDirectoryCursor(`1.${id}; drop table`)).toBeNull();
  });

  it('addresses an icon by its file, so a new icon is a new address', () => {
    const id = '0191d1a2-0000-7000-8000-000000000000';
    expect(appIconPath(id, null)).toBeNull();
    expect(appIconPath(id, '0191d1a2-0000-7000-8000-0000deadbeef')).toBe(
      `/v1/directory/${id}/icon?v=deadbeef`,
    );
  });
});
