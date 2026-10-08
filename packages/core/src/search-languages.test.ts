import { afterEach, describe, expect, it } from 'vitest';
import { english, makeTranslator, setTranslator } from './i18n';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';
import { isPlainText, looksLikeSentence, parseSearchQuery } from './search';

/**
 * Search reads every interface language (convention 17): the same shapes as English, as people
 * type them in Arabic (Egyptian and the Levant's words too), French and Turkish.
 */
// Wednesday 2026-09-23.
const now = new Date('2026-09-23T14:00:00Z');
const at = (q: string) => parseSearchQuery(q, { now });

afterEach(() => setTranslator(english));

describe('search in Arabic', () => {
  it.each([
    ['صور من سارة', { scope: 'files', fileKind: 'image', person: 'سارة' }],
    ['ملفات PDF من أحمد', { scope: 'files', fileKind: 'pdf', person: 'أحمد' }],
    ['الروابط', { scope: 'links' }],
    ['ماذا طلب مني أحمد', { scope: 'tasks', person: 'أحمد', direction: 'asked_me' }],
    ['ايه اللي سارة طلبته مني', { scope: 'tasks', person: 'سارة', direction: 'asked_me' }],
    ['ماذا طلبت من أحمد', { scope: 'tasks', person: 'أحمد', direction: 'i_asked' }],
    ['مستني من سارة', { scope: 'waiting', person: 'سارة' }],
    ['ماذا أنتظر', { scope: 'waiting', person: null }],
    ['ماذا قال أحمد عن العقد', { scope: 'messages', person: 'أحمد', text: 'العقد' }],
    ['قرارات عن التسعير', { scope: 'decisions', text: 'التسعير' }],
    ['القرارات', { scope: 'decisions', text: '' }],
    ['مهامي', { scope: 'tasks', person: null }],
    ['محادثات مشروع ألفا', { scope: 'contexts', text: 'مشروع ألفا' }],
    ['عرض السعر من سارة', { scope: 'messages', person: 'سارة', text: 'عرض السعر' }],
  ])('%s', (q, expected) => {
    expect(at(q)).toMatchObject(expected);
  });

  it('reads the days at the end, in the Gulf’s, Egypt’s and the Levant’s words', () => {
    expect(at('صور من الأسبوع الماضي')).toMatchObject({
      scope: 'files',
      fileKind: 'image',
      person: null,
      period: { since: '2026-09-14', until: '2026-09-21', label: 'الأسبوع الماضي' },
    });
    expect(at('العقد امبارح').period).toMatchObject({ since: '2026-09-22', until: '2026-09-23' });
    expect(at('القرارات الشهر اللي فات').period).toMatchObject({
      since: '2026-08-01',
      until: '2026-09-01',
    });
    expect(at('فواتير في مارس').period).toMatchObject({ since: '2026-03-01', until: '2026-04-01' });
    expect(at('فواتير آذار').period).toMatchObject({ since: '2026-03-01', until: '2026-04-01' });
    expect(at('العقد الجمعة الماضي').period).toMatchObject({ since: '2026-09-18' });
    expect(at('فواتير ٢٠٢٥').period).toMatchObject({ since: '2025-01-01', until: '2026-01-01' });
  });

  it('knows relationships by their Arabic names, “my” included', () => {
    setTranslator(makeTranslator('ar', ar));
    expect(at('عملائي')).toMatchObject({ scope: 'people', relationship: { sphere: 'customer' } });
    expect(at('العملاء')).toMatchObject({ scope: 'people', relationship: { sphere: 'customer' } });
    expect(at('عائلتي')).toMatchObject({ scope: 'people', relationship: { sphere: 'family' } });
    expect(at('زملائي')).toMatchObject({
      scope: 'people',
      relationship: { sphere: 'work', role: 'colleague' },
    });
  });
});

describe('search in French', () => {
  it.each([
    ['photos de Sarah', { scope: 'files', fileKind: 'image', person: 'Sarah' }],
    ['PDF d’Ahmed', { scope: 'files', fileKind: 'pdf', person: 'Ahmed' }],
    ['liens', { scope: 'links' }],
    ['ce que Sarah m’a demandé', { scope: 'tasks', person: 'Sarah', direction: 'asked_me' }],
    ['ce que j’ai demandé à Ahmed', { scope: 'tasks', person: 'Ahmed', direction: 'i_asked' }],
    ['ce que j’attends de Sarah', { scope: 'waiting', person: 'Sarah' }],
    [
      'qu’a dit Sarah sur la migration',
      { scope: 'messages', person: 'Sarah', text: 'la migration' },
    ],
    ['décisions sur le prix', { scope: 'decisions', text: 'le prix' }],
    ['mes tâches', { scope: 'tasks', person: null }],
    ['conversations sur Projet Alpha', { scope: 'contexts', text: 'Projet Alpha' }],
    ['devis de la part de Sarah', { scope: 'messages', person: 'Sarah', text: 'devis' }],
  ])('%s', (q, expected) => {
    expect(at(q)).toMatchObject(expected);
  });

  it('never reads a described thing as a person', () => {
    // "Photos de vacances" are holiday photos: no one called "vacances".
    expect(at('photos de vacances')).toMatchObject({ scope: 'all', person: null });
  });

  it('reads the days at the end', () => {
    expect(at('photos de la semaine dernière')).toMatchObject({
      scope: 'files',
      fileKind: 'image',
      period: { since: '2026-09-14', until: '2026-09-21', label: 'la semaine dernière' },
    });
    expect(at('contrat hier').period).toMatchObject({ since: '2026-09-22' });
    expect(at('décisions en mars').period).toMatchObject({
      since: '2026-03-01',
      until: '2026-04-01',
      label: 'mars',
    });
    expect(at('factures ce mois-ci').period).toMatchObject({ since: '2026-09-01' });
    expect(at('contrat vendredi dernier').period).toMatchObject({ since: '2026-09-18' });
  });

  it('knows relationships by their French names', () => {
    setTranslator(makeTranslator('fr', fr));
    expect(at('mes clients')).toMatchObject({
      scope: 'people',
      relationship: { sphere: 'customer' },
    });
    expect(at('Famille')).toMatchObject({ scope: 'people', relationship: { sphere: 'family' } });
  });
});

describe('search in Turkish', () => {
  it.each([
    ["Sarah'dan fotoğraflar", { scope: 'files', fileKind: 'image', person: 'Sarah' }],
    ["Ahmet'in PDF'leri", { scope: 'files', fileKind: 'pdf', person: 'Ahmet' }],
    ['bağlantılar', { scope: 'links' }],
    ["Sarah'nın benden istedikleri", { scope: 'tasks', person: 'Sarah', direction: 'asked_me' }],
    ["Ahmet'ten istediklerim", { scope: 'tasks', person: 'Ahmet', direction: 'i_asked' }],
    ["Sarah'dan beklediklerim", { scope: 'waiting', person: 'Sarah' }],
    ['Sarah taşıma hakkında ne dedi', { scope: 'messages', person: 'Sarah', text: 'taşıma' }],
    ['fiyat hakkında kararlar', { scope: 'decisions', text: 'fiyat' }],
    ['görevlerim', { scope: 'tasks', person: null }],
    ['Proje Alfa konuşmaları', { scope: 'contexts', text: 'Proje Alfa' }],
    ["Sarah'dan gelen teklif", { scope: 'messages', person: 'Sarah', text: 'teklif' }],
  ])('%s', (q, expected) => {
    expect(at(q)).toMatchObject(expected);
  });

  it('reads the days at the end', () => {
    expect(at('fotoğraflar geçen hafta')).toMatchObject({
      scope: 'files',
      fileKind: 'image',
      period: { since: '2026-09-14', until: '2026-09-21', label: 'geçen hafta' },
    });
    expect(at('sözleşme dün').period).toMatchObject({ since: '2026-09-22' });
    expect(at("faturalar mart'ta").period).toMatchObject({
      since: '2026-03-01',
      until: '2026-04-01',
    });
    expect(at('kararlar bu ay').period).toMatchObject({ since: '2026-09-01' });
    expect(at('sözleşme geçen cuma').period).toMatchObject({ since: '2026-09-18' });
  });

  it('knows relationships by their Turkish names, “my” included', () => {
    setTranslator(makeTranslator('tr', turkish));
    expect(at('müşterilerim')).toMatchObject({
      scope: 'people',
      relationship: { sphere: 'customer' },
    });
    expect(at('ailem')).toMatchObject({ scope: 'people', relationship: { sphere: 'family' } });
  });
});

describe('what a model may read, in every language', () => {
  it('a question or a sentence the rules didn’t read is one; a term is not', () => {
    expect(looksLikeSentence('ايه اللي حصل في الاجتماع')).toBe(true);
    expect(looksLikeSentence('qui a envoyé le contrat')).toBe(true);
    expect(looksLikeSentence('kim gönderdi')).toBe(true);
    expect(looksLikeSentence('contrat')).toBe(false);
    expect(looksLikeSentence('sözleşme')).toBe(false);
    // What the rules read never goes to a model.
    expect(isPlainText(at('صور من سارة'))).toBe(false);
    expect(isPlainText(at('photos de la semaine dernière'))).toBe(false);
    expect(isPlainText(at("Sarah'dan fotoğraflar"))).toBe(false);
  });
});
