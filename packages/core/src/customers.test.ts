import { describe, expect, it } from 'vitest';
import { type CustomerField, cleanTags, sameTag } from './customers';
import { fieldValue } from './field-values';

describe('what a team keeps about a customer (M16 H3)', () => {
  it('keeps one of each tag however it is cased or accented, in the order given', () => {
    expect(cleanTags([' VIP ', 'vip', 'New  patient', 'Café', 'cafe', ''])).toEqual([
      'VIP',
      'New patient',
      'Café',
    ]);
    expect(sameTag('مريض جديد', 'مريض جديد ')).toBe(true);
  });

  it('keeps a field’s value as its kind says, or says why not', () => {
    const number: CustomerField = { id: 'n', label: 'File number', kind: 'number' };
    const date: CustomerField = { id: 'd', label: 'Since', kind: 'date' };
    const choice: CustomerField = {
      id: 'c',
      label: 'Found us',
      kind: 'choice',
      choices: ['A friend', 'Instagram'],
    };
    const text: CustomerField = { id: 't', label: 'Insurance', kind: 'text' };
    expect(fieldValue(number, ' ١٢٣٤ ')).toEqual({ value: '1234' });
    expect(fieldValue(number, '12,5')).toEqual({ value: '12.5' });
    expect(fieldValue(number, 'twelve')).toHaveProperty('error');
    expect(fieldValue(date, '2026-10-19')).toEqual({ value: '2026-10-19' });
    expect(fieldValue(date, '2026-02-30')).toHaveProperty('error');
    expect(fieldValue(choice, 'instagram')).toEqual({ value: 'Instagram' });
    expect(fieldValue(choice, 'TikTok')).toHaveProperty('error');
    expect(fieldValue(text, '  AXA 77-1  ')).toEqual({ value: 'AXA 77-1' });
    // Empty is nothing kept.
    expect(fieldValue(text, '   ')).toEqual({ value: null });
  });
});
