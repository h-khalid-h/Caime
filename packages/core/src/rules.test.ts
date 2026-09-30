import { describe, expect, it } from 'vitest';
import { MARKETING_PAGES, SITE_PAGES } from './api';
import { emailError, handleError, handleFromName, passwordError } from './rules';
import { Handle, isReservedHandle, Password, RESERVED_HANDLES } from './schemas';

describe('field rules', () => {
  it('say the same as the server schemas', () => {
    for (const h of ['ab', 'sara', 'sara..k', '_sara', 'sara.k', 'a'.repeat(31), 'Sara_24']) {
      const server = Handle.safeParse(h);
      expect(handleError(h) === null).toBe(server.success);
    }
    for (const p of ['short', 'aaaaaaaaaaaa', 'correct horse battery', '1234567890']) {
      expect(passwordError(p) === null).toBe(Password.safeParse(p).success);
    }
  });

  it('suggest a handle from any name', () => {
    expect(handleFromName('Sara Ahmed')).toBe('sara.ahmed');
    expect(handleFromName('  José  Núñez ')).toBe('jose.nunez');
    expect(handleFromName('李')).toBe('');
    expect(handleError(handleFromName('Mary-Jane O’Neil'))).toBeNull();
  });

  it('checks email shape loosely (the server has the final word)', () => {
    expect(emailError('sara@example.com')).toBeNull();
    expect(emailError('sara@example')).not.toBeNull();
    expect(emailError('not an email')).not.toBeNull();
  });
});

describe('reserved handles (R35)', () => {
  it('are the product, its characters, whoever runs it and its own pages', () => {
    for (const h of [
      ...['caime', 'caishy', 'conniqt', 'cai'],
      ...['momo', 'panda', 'lumi', 'pico', 'niko', 'zuzu'],
      ...['admin', 'support', 'help', 'security', 'official', 'staff', 'team'],
      ...['noreply', 'no.reply', 'billing', 'verified'],
      ...['api', 'www', 'app', 'about', 'privacy', 'terms', 'settings', 'people', 'you', 'sw.js'],
      ...SITE_PAGES,
      ...MARKETING_PAGES,
    ])
      expect(isReservedHandle(h), h).toBe(true);
    // However it's typed.
    for (const h of ['Caime', '@CAIME', ' support ', '@Momo'])
      expect(isReservedHandle(h), h).toBe(true);
  });

  it('keep the product’s name out of every handle it reads in', () => {
    for (const h of [
      // A word of its own, beside anything.
      ...['caime.support', 'caime_official', 'support.caime', 'the.caime', 'caime.sara'],
      ...['caime.app', 'caime2', '2caime', 'caishy.fan', 'conniqt_team', 'caime.support.team'],
      // Split up, it still reads as one: the domain, as a handle.
      ...['cai.me', 'c.a.i.m.e', 'caim_e'],
      // Run together with words that make it sound official.
      ...['caimesupport', 'officialcaime', 'thecaime', 'mycaime', 'caimehq', 'getcaime'],
      ...['caimeteam', 'caimesupportteam', 'caishyofficial', 'realconniqt'],
    ])
      expect(isReservedHandle(h), h).toBe(true);
  });

  it('leave people’s own names free, and the words themselves in other handles', () => {
    for (const h of [
      // Cai is a Welsh given name and a common Chinese surname (R34): only @cai itself is kept.
      ...['cai.mei', 'caimei', 'caimeng', 'caimen', 'cai.ling', 'lin.cai', 'cai_wei', 'caitlin'],
      ...['caiming', 'cairo', 'mccain', 'connie', 'lucaimeyer', 'saracaime', 'caimes'],
      // A character's or a staff word's name beside anything else is someone's own.
      ...['momo.ali', 'niko.k', 'panda.lover', 'support.team', 'admin1', 'help_desk.eg'],
      ...['teamdatac', 'helpinghands', 'aboutyou', 'sara', 'noor.links', 'datac'],
    ])
      expect(isReservedHandle(h), h).toBe(false);
  });

  it('are all handles someone could type, which the rules and the schema let through', () => {
    // The form says nothing of them: the server answers them as it does a taken handle.
    for (const h of RESERVED_HANDLES) {
      expect(handleError(h), h).toBeNull();
      expect(Handle.safeParse(h).success, h).toBe(true);
    }
    expect(RESERVED_HANDLES.length).toBeGreaterThan(100);
  });
});
