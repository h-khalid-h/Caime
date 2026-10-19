/**
 * On the web there is no token in JavaScript at all: the session is an httpOnly cookie (ADR-7).
 * A phone's keychain is `secure.ts`; this keeps its library out of the web's first download.
 */
export async function readToken(): Promise<string | null> {
  return null;
}

export async function writeToken(_token: string | null): Promise<void> {}
