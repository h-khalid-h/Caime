import { tr } from './i18n';
/**
 * Calls (PRD §47): 1:1 voice and video in a direct conversation. The server rings, relays how
 * the two devices reach each other, and keeps the call's history; the media goes between them
 * directly, encrypted, and never through Caime (unless a relay is set up, which can't read it).
 */

export const CALL_KINDS = ['voice', 'video'] as const;
export type CallKind = (typeof CALL_KINDS)[number];

export type CallState = 'ringing' | 'active' | 'ended';

/** How a call ended: answered and talked, nobody answered, turned down, called off, or dropped. */
export type CallOutcome = 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed';

/** How long a call rings before it's missed. */
export const CALL_RING_SECONDS = 45;

/**
 * A group call connects every device in it to every other (no server in the middle), so it's
 * for small groups: up to this many people in the conversation.
 */
export const GROUP_CALL_MAX = 8;

/** Where each person in a group call is. */
export type GroupCallMemberState = 'ringing' | 'joined' | 'left' | 'declined' | 'missed';

/** "under a minute", "4 min", "1 h 5 min": how long two people talked. */
export function callDuration(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? tr('{h} h {m} min', { h, m: m % 60 }) : `${h} h`;
}

/**
 * The line a call leaves in the conversation, for whoever reads it: "Video call · 4 min",
 * "Missed voice call" to the person who was called, "Voice call · no answer" to the caller.
 */
export function callText(
  kind: CallKind,
  outcome: CallOutcome,
  seconds: number,
  viewerCalled: boolean,
  group = false,
): string {
  if (group) return groupCallText(kind, outcome, seconds, viewerCalled);
  const name = kind === 'video' ? tr('Video call') : tr('Voice call');
  switch (outcome) {
    case 'completed':
      return `${name} · ${callDuration(seconds)}`;
    case 'failed':
      return `${name} · couldn’t connect`;
    case 'declined':
      return viewerCalled
        ? tr('{name} · no answer', { name })
        : tr('You declined a {toLowerCase}', { toLowerCase: name.toLowerCase() });
    case 'cancelled':
      return viewerCalled
        ? `${name} · cancelled`
        : tr('Missed {toLowerCase}', { toLowerCase: name.toLowerCase() });
    default:
      return viewerCalled
        ? tr('{name} · no answer', { name })
        : tr('Missed {toLowerCase}', { toLowerCase: name.toLowerCase() });
  }
}

/**
 * A group call's line: "Group video call · 12 min" for everyone, or, when nobody else joined,
 * "Group voice call · no answer" to whoever started it and "Missed group voice call" to the rest.
 */
function groupCallText(
  kind: CallKind,
  outcome: CallOutcome,
  seconds: number,
  viewerStarted: boolean,
): string {
  const name = kind === 'video' ? tr('Group video call') : tr('Group voice call');
  if (outcome === 'completed') return `${name} · ${callDuration(seconds)}`;
  if (outcome === 'failed') return `${name} · couldn’t connect`;
  if (viewerStarted)
    return outcome === 'cancelled' ? `${name} · cancelled` : tr('{name} · no answer', { name });
  return tr('Missed {toLowerCase}', { toLowerCase: name.toLowerCase() });
}

/** How a call went for one person, for their call history. */
export type CallResult = 'answered' | 'missed' | 'declined' | 'unanswered' | 'cancelled' | 'failed';

/**
 * A call as it went for one person: `outgoing` when they called (or started the group call).
 * Whoever calls is never told they were turned down ("no answer", as the call's line says); in a
 * group call, someone rung was in it if they joined at any point.
 */
export function callResult(input: {
  outcome: CallOutcome;
  outgoing: boolean;
  group?: boolean;
  /** A group call: they joined it at some point. */
  joined?: boolean;
  /** A group call: they turned it down. */
  declined?: boolean;
}): CallResult {
  const { outcome, outgoing } = input;
  if (outcome === 'failed') return 'failed';
  if (input.group && !outgoing)
    return input.joined ? 'answered' : input.declined ? 'declined' : 'missed';
  if (outcome === 'completed') return 'answered';
  if (outgoing) return outcome === 'cancelled' ? 'cancelled' : 'unanswered';
  return outcome === 'declined' ? 'declined' : 'missed';
}
