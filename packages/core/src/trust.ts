/**
 * Trust (PRD §54): what Caishy actually knows about who someone is, said in words rather than a
 * decorative badge.
 */

export type TrustLevel = 'org_verified' | 'verified' | 'known' | 'unknown';

export interface TrustInput {
  /** The viewer is connected to them, or shares a conversation with them. */
  known: boolean;
  /** Caishy verified a contact method (email) for this account. */
  emailVerified: boolean;
  /** Verified member of a verified organization, e.g. "DATA C". */
  verifiedOrgName: string | null;
  kind: 'human' | 'bot' | 'agent';
}

export interface Trust {
  level: TrustLevel;
  /** Short line for profiles and connection requests. */
  label: string;
  /** One sentence explaining what the label means. */
  detail: string;
}

export function trustFor(input: TrustInput): Trust {
  if (input.kind !== 'human') {
    const what = input.kind === 'bot' ? 'an automated account (bot)' : 'an AI agent';
    return {
      level: input.verifiedOrgName ? 'org_verified' : 'unknown',
      label: input.kind === 'bot' ? 'Bot' : 'AI agent',
      detail: `This is ${what}, not a person${input.verifiedOrgName ? `, operated by ${input.verifiedOrgName}` : ''}.`,
    };
  }
  if (input.verifiedOrgName) {
    return {
      level: 'org_verified',
      label: `Verified at ${input.verifiedOrgName}`,
      detail: `${input.verifiedOrgName} confirmed this person is part of their organization.`,
    };
  }
  if (input.emailVerified) {
    return {
      level: 'verified',
      label: 'Verified email',
      detail: 'Caishy confirmed this account controls its email address.',
    };
  }
  if (input.known) {
    return {
      level: 'known',
      label: 'Known to you',
      detail: 'You are connected or share a conversation.',
    };
  }
  return {
    level: 'unknown',
    label: 'New to you',
    detail:
      'You’re not connected, and Caishy hasn’t verified who this is. Be careful with links and payments.',
  };
}
