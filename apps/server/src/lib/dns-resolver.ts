/**
 * DNS lookups, injectable so tests can stand in for the internet: an organization's domain proof
 * (R42) and mail's DKIM, SPF and DMARC (R75). A leaf of its own, so what only needs the type (the
 * tests' and the E2E's mail fixtures) reads nothing of the server.
 */
export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
  /** Any other record type (SPF's A, AAAA and MX for mail in, R75); a stand-in may leave it out. */
  resolve?(hostname: string, rrtype: string): Promise<string[] | string[][]>;
}
