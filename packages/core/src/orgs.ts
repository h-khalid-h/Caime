/**
 * Organizations (PRD §35–36, §55, R15): a business, a shop, a clinic, a school, a nonprofit or a
 * public service, with its team. It proves it controls a domain with a DNS TXT record, and only
 * then do its people show as "Verified at <name>": the claim is the organization's, checked.
 */

/**
 * The latest year an organization can have begun: the year it already is somewhere (UTC+14), so
 * the form and the server agree on New Year's Day wherever it's filled in.
 */
export function latestFoundedYear(now: Date = new Date()): number {
  return new Date(now.getTime() + 14 * 3_600_000).getUTCFullYear();
}

export const ORG_KINDS = [
  'business',
  'shop',
  'clinic',
  'school',
  'nonprofit',
  'public_service',
  'other',
] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

/** An organization's update (PRD §59) is short: a paragraph or two, a link. */
export const UPDATE_MAX = 2000;

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  business: 'Business',
  shop: 'Shop',
  clinic: 'Clinic or practice',
  school: 'School',
  nonprofit: 'Nonprofit',
  public_service: 'Public service',
  other: 'Something else',
};

/** The kind as a profile says it: "Something else" is a choice, not a name. */
export function orgKindName(kind: OrgKind): string {
  return kind === 'other' ? 'Organization' : ORG_KIND_LABELS[kind];
}

export const ORG_ROLES = ['owner', 'admin', 'agent'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** "Agent" is the data model's word; people read "Team". */
export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Team',
};

export function canManageOrg(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Owners remove anyone but themselves; admins remove the team. Anyone may leave. */
export function canRemoveFromOrg(actor: OrgRole, target: OrgRole): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'admin') return target === 'agent';
  return false;
}

/** Only the owner makes admins. */
export function canChangeOrgRole(actor: OrgRole, target: OrgRole): boolean {
  return actor === 'owner' && target !== 'owner';
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * A domain as people type it ("https://www.DataC.com/about") as the name to verify
 * ("datac.com"). Null when it isn't a public domain name (an address, "localhost", one label).
 */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0] ?? '';
  host = host.replace(/:\d+$/, '').replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (host.length === 0 || host.length > 253) return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  // The last label is a real top-level domain: letters (or an IDN's xn-- form), never digits.
  const tld = labels[labels.length - 1] ?? '';
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return null;
  return host;
}

/** Where the TXT record goes, and what it says. */
export const VERIFY_RECORD_PREFIX = '_caishy-verify';

export function verificationRecord(domain: string, token: string) {
  return {
    name: `${VERIFY_RECORD_PREFIX}.${domain}`,
    type: 'TXT' as const,
    value: `caishy-verify=${token}`,
  };
}

/** TXT answers arrive as chunks per record; a record matches when its chunks spell the value. */
export function recordMatches(
  records: ReadonlyArray<ReadonlyArray<string>>,
  token: string,
): boolean {
  const want = `caishy-verify=${token}`;
  return records.some((chunks) => chunks.join('').trim() === want);
}
