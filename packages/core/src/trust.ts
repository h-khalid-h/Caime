import { tr } from './i18n';
/**
 * Trust (PRD §54): what Caime actually knows about who someone is, said in words rather than a
 * decorative badge.
 */

export type TrustLevel = 'org_verified' | 'verified' | 'known' | 'unknown';

export interface TrustInput {
  /** The viewer is connected to them, or shares a conversation with them. */
  known: boolean;
  /** Caime verified a contact method (email) for this account. */
  emailVerified: boolean;
  /** Verified member of a verified organization, e.g. "DATA C". */
  verifiedOrgName: string | null;
  kind: 'human' | 'bot' | 'agent' | 'assistant' | 'character' | 'provisional';
  /** A stand-in for mail whose sender Caime couldn't confirm (M16 F1): an address, nobody known. */
  unverifiedSender?: boolean;
}

export interface Trust {
  level: TrustLevel;
  /** Short line for profiles and connection requests. */
  label: string;
  /** One sentence explaining what the label means. */
  detail: string;
  /** A stand-in for mail nobody confirmed (M16 F1): nobody to write to, connect with or answer. */
  unverifiedSender?: true;
}

export function trustFor(input: TrustInput): Trust {
  // Caime's own (R67): verified by being Caime's, and never a person.
  if (input.kind === 'assistant')
    return {
      level: 'org_verified',
      label: tr('Caime’s assistant'),
      detail: tr('This is Cai, Caime’s own AI assistant, not a person.'),
    };
  if (input.kind === 'character')
    return {
      level: 'org_verified',
      label: tr('Caime Friend'),
      detail: tr(
        'This is one of Caime’s friends: not a person. It answers by its rules and, with AI assist on, with a model’s help, in its own character.',
      ),
    };
  // Mail came in naming an address its sender couldn't be shown to hold (M16 F1): the stand-in
  // is nobody anyone vouched for, and nothing it carries is taken as the address's.
  if (input.kind === 'provisional' && input.unverifiedSender)
    return {
      level: 'unknown',
      label: tr('Sender not confirmed'),
      detail: tr(
        'Mail came in naming this address, but Caime couldn’t confirm it was sent from it, so nothing in it is taken as theirs.',
      ),
      unverifiedSender: true,
    };
  // Reached by mail (R75): a person, vouched for by the server that received their mail, not
  // yet on Caime.
  if (input.kind === 'provisional')
    return {
      level: 'unknown',
      label: tr('Reached by email'),
      detail: tr(
        'This person wrote in by email and isn’t on Caime yet. Their address was vouched for by the mail server that received it.',
      ),
    };
  if (input.kind !== 'human') {
    const what = input.kind === 'bot' ? tr('an automated account (bot)') : tr('an AI agent');
    return {
      level: input.verifiedOrgName ? 'org_verified' : 'unknown',
      label: input.kind === 'bot' ? tr('Bot') : tr('AI agent'),
      detail: input.verifiedOrgName
        ? tr('This is {what}, not a person, operated by {org}.', {
            what,
            org: input.verifiedOrgName,
          })
        : tr('This is {what}, not a person.', { what }),
    };
  }
  if (input.verifiedOrgName) {
    return {
      level: 'org_verified',
      label: tr('Verified at {verifiedOrgName}', { verifiedOrgName: input.verifiedOrgName }),
      detail: tr('{verifiedOrgName} confirmed this person is part of their organization.', {
        verifiedOrgName: input.verifiedOrgName,
      }),
    };
  }
  if (input.emailVerified) {
    return {
      level: 'verified',
      label: tr('Verified email'),
      detail: tr('Caime confirmed this account controls its email address.'),
    };
  }
  if (input.known) {
    return {
      level: 'known',
      label: tr('Known to you'),
      detail: tr('You are connected or share a conversation.'),
    };
  }
  return {
    level: 'unknown',
    label: tr('New to you'),
    detail: tr(
      'You’re not connected, and Caime hasn’t verified who this is. Be careful with links and payments.',
    ),
  };
}
