import { describe, expect, it } from 'vitest';
import { emailError, handleError, handleFromName, passwordError } from './rules';
import { Handle, Password } from './schemas';

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
