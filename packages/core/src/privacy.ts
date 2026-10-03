/**
 * Privacy (PRD §34, §62). Who can see which part of a profile is decided by the *owner's* rules,
 * applied to the owner's own classification of the viewer — which itself is never revealed
 * (docs/ARCHITECTURE.md ADR-10).
 */

import { msg, tr } from './i18n';
import type { PrivacyPreset } from './policy';
import type { Sphere } from './taxonomy';

export const PRIVACY_FIELDS = [
  'profilePhoto',
  'bio',
  'pronouns',
  'status',
  'onlineStatus',
  'lastSeen',
  'readReceipts',
  'identityDetails',
  'location',
  'busy',
  'busyDetails',
] as const;
export type PrivacyField = (typeof PRIVACY_FIELDS)[number];

export type Audience =
  | { kind: 'everyone' }
  | { kind: 'connections' }
  | { kind: 'spheres'; spheres: Sphere[] }
  | { kind: 'nobody' };

export type MessageRequestsFrom = 'everyone' | 'shared_connections' | 'nobody';

export interface PrivacySettings {
  fields: Record<PrivacyField, Audience>;
  discoverByHandle: boolean;
  discoverByEmail: boolean;
  messageRequests: MessageRequestsFrom;
}

export interface Viewer {
  isSelf: boolean;
  isConnected: boolean;
  /** Either side blocked the other. */
  blocked: boolean;
  /** The owner's active classifications of the viewer (spheres only). */
  ownerSpheresForViewer: Sphere[];
  /** Privacy preset of the owner's policy for the viewer's relationship. */
  preset?: PrivacyPreset;
}

export const FIELD_LABELS: Record<PrivacyField, string> = {
  profilePhoto: msg('Profile photo'),
  bio: 'About',
  pronouns: 'Pronouns',
  status: 'Status',
  onlineStatus: msg('Online status'),
  lastSeen: msg('Last seen'),
  readReceipts: msg('Read receipts'),
  identityDetails: msg('Professional details'),
  location: 'Location',
  busy: msg('In a meeting'),
  busyDetails: msg('What the meeting is'),
};

/** Fields a "limited" relationship preset hides even when the account-wide rule would allow them. */
const LIMITED_HIDES: PrivacyField[] = [
  'onlineStatus',
  'lastSeen',
  'readReceipts',
  'status',
  'bio',
  'location',
  'pronouns',
  'busy',
  'busyDetails',
];

export function defaultPrivacy(opts: { minor: boolean }): PrivacySettings {
  const connections: Audience = { kind: 'connections' };
  return {
    fields: {
      profilePhoto: opts.minor ? connections : { kind: 'everyone' },
      bio: opts.minor ? connections : { kind: 'everyone' },
      pronouns: connections,
      status: connections,
      onlineStatus: connections,
      lastSeen: connections,
      readReceipts: connections,
      identityDetails: opts.minor ? connections : { kind: 'everyone' },
      location: { kind: 'nobody' },
      // In a meeting (R51): connections see busy or free; what it is, family (and whoever is
      // in the conversation it was made in, who know anyway).
      busy: connections,
      busyDetails: { kind: 'spheres', spheres: ['family'] },
    },
    discoverByHandle: true,
    // R29: under-18 accounts are never discoverable by email.
    discoverByEmail: !opts.minor,
    messageRequests: opts.minor ? 'shared_connections' : 'everyone',
  };
}

export function audienceAllows(audience: Audience, viewer: Viewer): boolean {
  switch (audience.kind) {
    case 'everyone':
      return true;
    case 'connections':
      return viewer.isConnected;
    case 'spheres':
      return (
        viewer.isConnected && viewer.ownerSpheresForViewer.some((s) => audience.spheres.includes(s))
      );
    case 'nobody':
      return false;
  }
}

export function canSee(settings: PrivacySettings, field: PrivacyField, viewer: Viewer): boolean {
  if (viewer.isSelf) return true;
  if (viewer.blocked) return false;
  if (viewer.preset === 'limited' && LIMITED_HIDES.includes(field)) return false;
  return audienceAllows(settings.fields[field], viewer);
}

/**
 * Read receipts are reciprocal: you see someone's receipts only if they can see yours. Nobody
 * gets a one-way view of whether the other side has read their message.
 */
export function readReceiptsVisible(
  owner: { settings: PrivacySettings; viewerAsSeenByOwner: Viewer },
  viewer: { settings: PrivacySettings; ownerAsSeenByViewer: Viewer },
): boolean {
  return (
    canSee(owner.settings, 'readReceipts', owner.viewerAsSeenByOwner) &&
    canSee(viewer.settings, 'readReceipts', viewer.ownerAsSeenByViewer)
  );
}

export function describeAudience(audience: Audience, sphereLabel: (s: Sphere) => string): string {
  switch (audience.kind) {
    case 'everyone':
      return 'Everyone';
    case 'connections':
      return tr('Your connections');
    case 'spheres':
      return audience.spheres.length ? audience.spheres.map(sphereLabel).join(', ') : 'Nobody';
    case 'nobody':
      return 'Nobody';
  }
}
