import { describe, expect, it } from 'vitest';
import { latinLanguage } from './latin-language';

describe('latinLanguage', () => {
  it.each([
    "Je t'envoie le contrat demain",
    "Tu peux m'envoyer le devis ?",
    'Ça marche',
    "D'accord pour vendredi",
    'Envoie-moi le planning stp',
    'Réunion confirmée',
  ])('French: %s', (text) => {
    expect(latinLanguage(text)).toBe('fr');
  });

  it.each([
    'Yarın sözleşmeyi göndereceğim',
    'Faturayı gönder',
    'Tamam',
    'Toplantı ne zaman',
    // Typed without Turkish letters, the endings still say it.
    'yarin gonderecegim',
    "Ahmet'e sor",
    'Kargoya verildi',
  ])('Turkish: %s', (text) => {
    expect(latinLanguage(text)).toBe('tr');
  });

  it.each([
    "I'll send Ayşe the contract tomorrow",
    'Café at 3?',
    'Send the résumé to Léa by Friday',
    'Meeting 3pm EST',
    'Ben will call you later',
    'Thanks, merci!',
    'Ok',
    'Order #48213 shipped',
    '',
  ])('English, or too little to say otherwise: %s', (text) => {
    expect(latinLanguage(text)).toBe('en');
  });
});
