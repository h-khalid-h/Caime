import { describe, expect, it } from 'vitest';
import {
  english,
  fill,
  languageFor,
  languageInSearch,
  makeTranslator,
  msg,
  resolveLanguage,
  setTranslator,
  tr,
  trn,
} from './i18n';

describe('the interface language (R54)', () => {
  it('picks a language from a device tag, or English', () => {
    expect(languageFor('ar-EG')).toBe('ar');
    expect(languageFor('AR')).toBe('ar');
    expect(languageFor('en-GB')).toBe('en');
    expect(languageFor('fr-FR')).toBe('fr');
    expect(languageFor('de-DE')).toBe('en');
    expect(languageFor(null)).toBe('en');
    expect(resolveLanguage('auto', 'ar-SA')).toBe('ar');
    expect(resolveLanguage('en', 'ar-SA')).toBe('en');
    expect(resolveLanguage(undefined, 'de')).toBe('en');
  });

  it('reads a language asked for in a query, and nothing else', () => {
    expect(languageInSearch('?lang=ar')).toBe('ar');
    expect(languageInSearch('lang=en&x=1')).toBe('en');
    expect(languageInSearch('?lang=xx')).toBeNull();
    expect(languageInSearch('?other=ar')).toBeNull();
    expect(languageInSearch('')).toBeNull();
    expect(languageInSearch(null)).toBeNull();
  });

  it('fills variables and leaves what it has no value for', () => {
    expect(fill('{name} invited you · {where}', { name: 'Noor', where: 'Work' })).toBe(
      'Noor invited you · Work',
    );
    expect(fill('{n} left', {})).toBe('{n} left');
  });

  it('translates through a catalog and falls back to the English', () => {
    const ar = makeTranslator('ar', {
      Chats: 'الدردشات',
      '{name} invited you': 'دعاك {name}',
      '{n} messages': {
        zero: 'لا رسائل',
        one: 'رسالة واحدة',
        two: 'رسالتان',
        few: '{n} رسائل',
        many: '{n} رسالة',
        other: '{n} رسالة',
      },
    });
    expect(ar.dir).toBe('rtl');
    expect(ar.tr('Chats')).toBe('الدردشات');
    expect(ar.tr('{name} invited you', { name: 'نور' })).toBe('دعاك نور');
    expect(ar.tr('Not in the catalog')).toBe('Not in the catalog');
    expect(ar.trn(0, 'one message', '{n} messages')).toBe('لا رسائل');
    expect(ar.trn(1, 'one message', '{n} messages')).toBe('رسالة واحدة');
    expect(ar.trn(2, 'one message', '{n} messages')).toBe('رسالتان');
    expect(ar.trn(5, 'one message', '{n} messages')).toBe('5 رسائل');
    expect(ar.trn(11, 'one message', '{n} messages')).toBe('11 رسالة');
    expect(ar.trn(100, 'one message', '{n} messages')).toBe('100 رسالة');
    // English needs no catalog: one or other.
    expect(english.trn(1, 'one message', '{n} messages')).toBe('one message');
    expect(english.trn(3, 'one message', '{n} messages')).toBe('3 messages');
    expect(english.dir).toBe('ltr');
  });

  it('runs on the translator set at boot, English until then', () => {
    expect(tr('Chats')).toBe('Chats');
    setTranslator(
      makeTranslator('ar', { Chats: 'الدردشات', '{n} people': { other: '{n} أشخاص' } }),
    );
    expect(tr('Chats')).toBe('الدردشات');
    expect(trn(3, 'one person', '{n} people')).toBe('3 أشخاص');
    setTranslator(english);
    expect(tr('Chats')).toBe('Chats');
    expect(msg('A week')).toBe('A week');
  });
});
