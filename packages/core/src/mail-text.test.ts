import { describe, expect, it } from 'vitest';
import { mailText } from './mail-text';

// What Gmail sent in the owner's test thread (2026-10-15): its plain-text copy writes bold and
// italic as asterisks, and every mail carries the same signature.
const GMAIL_TEXT = [
  'Finally',
  '',
  '',
  '',
  '*Hussein Khalid*',
  'CEO | *DATA C*',
  '*Connecting Businesses with Affordable AI-Powered Talents*',
  '🌐 www.datac.com',
  '✉️ h.khalid@datac.com',
  '📞 +201 013 152 969',
  '📍 Based in Europe | Serving Worldwide',
].join('\n');
const GMAIL_HTML =
  '<div dir="ltr">Finally<br><br><div><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">' +
  '<div dir="ltr"><b>Hussein Khalid</b><br>CEO | <b>DATA C</b><br><i>Connecting Businesses with Affordable AI-Powered Talents</i><br>' +
  '🌐 <a href="http://www.datac.com">www.datac.com</a><br>✉️ <a href="mailto:h.khalid@datac.com">h.khalid@datac.com</a><br>' +
  '📞 +201 013 152 969<br>📍 Based in Europe | Serving Worldwide</div></div></div></div>';

describe('mailText', () => {
  it('takes Gmail’s signature apart by its HTML mark, without the asterisks', () => {
    const out = mailText(GMAIL_TEXT, GMAIL_HTML);
    expect(out.body).toBe('Finally');
    expect(out.signature?.split('\n')[0]).toBe('Hussein Khalid');
    expect(out.signature).toContain('CEO | DATA C');
    expect(out.signature).not.toContain('*');
  });

  it('cuts at a "-- " line', () => {
    expect(mailText('See you then.\n-- \nSara\nAcme', null)).toEqual({
      body: 'See you then.',
      signature: 'Sara\nAcme',
    });
  });

  it('knows a signature from the same sender’s last one, when the HTML marks none', () => {
    const out = mailText(
      'Thursday works.\n\nSara Haddad\nPartner, Acme',
      null,
      'Sara Haddad\nPartner, Acme',
    );
    expect(out).toEqual({ body: 'Thursday works.', signature: 'Sara Haddad\nPartner, Acme' });
    // One line is too common to cut by.
    expect(mailText('Yes.\nThanks', null, 'Thanks').signature).toBeNull();
  });

  it('keeps asterisks someone typed in a mail with no emphasis of its own', () => {
    expect(mailText('5 * 3 is *not* 16', '<div>5 * 3 is *not* 16</div>').body).toBe(
      '5 * 3 is *not* 16',
    );
  });

  it('keeps the words of a mail that is nothing but its signature', () => {
    const out = mailText(
      '*Hussein Khalid*\nCEO',
      '<div class="gmail_signature"><b>Hussein Khalid</b><br>CEO</div>',
    );
    expect(out.body).toBe('Hussein Khalid\nCEO');
    expect(out.signature).toBeNull();
  });

  it('folds runs of blank lines', () => {
    expect(mailText('One\n\n\n\nTwo', null).body).toBe('One\n\nTwo');
  });
});
