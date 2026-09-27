import { describe, expect, it } from 'vitest';
import {
  type AutomationWhen,
  automationMatches,
  collectionName,
  describeAutomation,
  hasWord,
  SAVED_DEFAULT,
  whoSends,
  wordsFrom,
} from './automations';

const invoices: AutomationWhen = {
  sphere: 'customer',
  role: null,
  kinds: ['document'],
  words: ['invoice'],
};

describe('hasWord', () => {
  it('finds a word where a word starts, in any case and without accents', () => {
    expect(hasWord('Invoice_0923.pdf', ['invoice'])).toBe(true);
    expect(hasWord('September invoices.pdf', ['invoice'])).toBe(true);
    expect(hasWord('my-invoice.pdf', ['invoice'])).toBe(true);
    expect(hasWord('reinvoice.pdf', ['invoice'])).toBe(false);
    expect(hasWord('Facturé en septembre', ['facture'])).toBe(true);
    expect(hasWord('the purchase order is attached', ['purchase order'])).toBe(true);
    expect(hasWord('purchase and order', ['purchase order'])).toBe(false);
    expect(hasWord('', ['invoice'])).toBe(false);
    expect(hasWord('invoice', ['  '])).toBe(false);
  });

  it('finds a word that starts inside a name: camelCase, after a number, another script', () => {
    expect(hasWord('CustomerInvoice.pdf', ['invoice'])).toBe(true);
    expect(hasWord('0923invoice.pdf', ['invoice'])).toBe(true);
    expect(hasWord('請求書invoice.pdf', ['invoice'])).toBe(true);
    // Still never inside a word.
    expect(hasWord('REINVOICE.pdf', ['invoice'])).toBe(false);
    expect(hasWord('Reinvoice.pdf', ['invoice'])).toBe(false);
  });

  it('finds an Arabic word with its article, and with a letter-word written onto it', () => {
    expect(hasWord('الفاتورة.pdf', ['فاتورة'])).toBe(true);
    expect(hasWord('مرفق الفاتورة', ['فاتورة'])).toBe(true);
    expect(hasWord('وبالفاتورة', ['فاتورة'])).toBe(true);
    expect(hasWord('بالفاتورة', ['فاتورة'])).toBe(true);
    expect(hasWord('للفاتورة', ['فاتورة'])).toBe(true);
    expect(hasWord('كالفاتورة', ['فاتورة'])).toBe(true);
    // Not a word inside another.
    expect(hasWord('مالفاتورة', ['فاتورة'])).toBe(false);
  });

  it('finds a word inside text written without spaces', () => {
    expect(hasWord('今月の請求書です', ['請求書'])).toBe(true);
  });

  it('finds a word in a name written decomposed, as macOS keeps file names', () => {
    // Korean, Japanese voiced kana and an Arabic hamza, each as its letter and its marks.
    expect(hasWord('인보이스_9월.pdf'.normalize('NFD'), ['인보이스'])).toBe(true);
    expect(hasWord('請求書がある.pdf'.normalize('NFD'), ['が'])).toBe(true);
    expect(hasWord('أمر شراء.pdf'.normalize('NFD'), ['أمر'])).toBe(true);
    // And a word typed decomposed finds one written composed.
    expect(hasWord('Facturé.pdf', ['facturé'.normalize('NFD')])).toBe(true);
  });

  it('finds a Greek word whatever its last sigma, in capitals or not', () => {
    expect(hasWord('ΛΟΓΑΡΙΑΣΜΟΣ Σεπτεμβρίου.pdf', ['λογαριασμος'])).toBe(true);
    expect(hasWord('λογαριασμός.pdf', ['ΛΟΓΑΡΙΑΣΜΟΣ'])).toBe(true);
  });

  it('is quick on a long message looked in many times', () => {
    const text = `${'Here are the links for the project, see '.repeat(100)}invoice`;
    const started = performance.now();
    for (let i = 0; i < 2000; i++) hasWord(text, ['invoice', 'receipt']);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps marks that make another letter', () => {
    // A kana's voicing mark makes a different syllable: が is not か.
    expect(hasWord('がっこう', ['かっこう'])).toBe(false);
  });
});

describe('automationMatches', () => {
  const arrival = {
    sphere: 'customer' as const,
    role: null,
    kind: 'document',
    name: 'Invoice 42.pdf',
    text: '',
  };

  it('matches whose it is, what it is and a word in its name or its message', () => {
    expect(automationMatches(invoices, arrival)).toBe(true);
    expect(
      automationMatches(invoices, { ...arrival, name: 'scan.pdf', text: 'Your invoice' }),
    ).toBe(true);
    expect(automationMatches(invoices, { ...arrival, name: 'scan.pdf', text: 'Thanks' })).toBe(
      false,
    );
    expect(automationMatches(invoices, { ...arrival, sphere: 'vendor' })).toBe(false);
    expect(automationMatches(invoices, { ...arrival, kind: 'photo' })).toBe(false);
  });

  it('with no words, anything of its kinds; with no sphere, anyone; a role, only that role', () => {
    const any: AutomationWhen = { sphere: null, role: null, kinds: ['photo', 'video'], words: [] };
    expect(automationMatches(any, { ...arrival, sphere: null, kind: 'video' })).toBe(true);
    expect(automationMatches(any, { ...arrival, kind: 'document' })).toBe(false);
    const managers: AutomationWhen = { ...invoices, sphere: 'work', role: 'manager', words: [] };
    expect(automationMatches(managers, { ...arrival, sphere: 'work', role: 'manager' })).toBe(true);
    expect(automationMatches(managers, { ...arrival, sphere: 'work', role: 'peer' })).toBe(false);
  });
});

describe('describing an automation', () => {
  it('says whose, what and where, as the PRD does', () => {
    expect(describeAutomation({ when: invoices, collection: 'Customer Files' })).toBe(
      'When a customer sends a file with “invoice”, save it to Customer Files',
    );
    expect(
      describeAutomation({
        when: { sphere: null, role: null, kinds: ['link', 'photo', 'document'], words: [] },
        collection: 'Saved',
      }),
    ).toBe('When anyone sends a file, a photo or a link, save it to Saved');
    expect(
      describeAutomation({
        when: { ...invoices, words: ['invoice', 'receipt'] },
        collection: 'Receipts',
      }),
    ).toBe('When a customer sends a file with “invoice” or “receipt”, save it to Receipts');
  });

  it('names who sends it in words', () => {
    expect(whoSends({ sphere: 'work', role: 'manager' })).toBe('a manager');
    expect(whoSends({ sphere: 'work', role: null })).toBe('someone from work');
    expect(whoSends({ sphere: 'acquaintance', role: null })).toBe('an acquaintance');
    expect(whoSends({ sphere: 'family', role: null })).toBe('family');
    expect(whoSends({ sphere: 'customer', role: 'VIP' })).toBe('a customer (VIP)');
  });
});

describe('words and collections as typed', () => {
  it('splits words on commas, drops quotes and repeats, and keeps at most ten', () => {
    expect(wordsFrom(' invoice, “Receipt” , receipt,,')).toEqual(['invoice', 'Receipt']);
    expect(wordsFrom('فاتورة، إيصال')).toEqual(['فاتورة', 'إيصال']);
    expect(wordsFrom('发票，收据；领收书')).toEqual(['发票', '收据', '领收书']);
    expect(wordsFrom('فاتورة؛ إيصال')).toEqual(['فاتورة', 'إيصال']);
    expect(wordsFrom(Array.from({ length: 12 }, (_, i) => `w${i}`).join(','))).toHaveLength(10);
  });

  it('tidies a collection name, and never leaves it empty', () => {
    expect(collectionName('  Customer   Files ')).toBe('Customer Files');
    expect(collectionName('')).toBe(SAVED_DEFAULT);
    expect(collectionName(null)).toBe(SAVED_DEFAULT);
  });
});
