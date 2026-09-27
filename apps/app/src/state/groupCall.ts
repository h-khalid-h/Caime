/**
 * The group call on this device (PRD §47), for the call screen to draw, and the calls on in the
 * person's groups, for the banner that offers to join one. The WebRTC work lives in
 * features/calls/group; this is only what it tells the screens.
 */
import type { CallPersonView, GroupCallView } from '@caishy/core/api';
import { create } from 'zustand';
import type { TheirState } from './calls';

export type GroupCallPhase =
  /** Asking for the microphone and camera, then ringing the group. */
  | 'starting'
  /** It rings for this person. */
  | 'incoming'
  /** Joining it on this device. */
  | 'joining'
  /** In it: connected to whoever else is. */
  | 'in'
  | 'ended';

/** Another device in the call, as this one sees it. */
export interface GroupPeer {
  /** Whose device, and which (a device is in a call for one person). */
  key: string;
  device: string;
  person: CallPersonView;
  stream: MediaStream | null;
  /** How the connection between the two devices stands. */
  link: 'connecting' | 'connected' | 'reconnecting' | 'failed';
  /** What that device says it's doing (null until it has said). */
  theirs: TheirState | null;
}

interface GroupCallStore {
  call: GroupCallView | null;
  phase: GroupCallPhase | null;
  local: MediaStream | null;
  /** Every other device in the call, by its `key`. */
  peers: Record<string, GroupPeer>;
  muted: boolean;
  cameraOff: boolean;
  sharing: boolean;
  note: string | null;
  /** The call on in each group, by conversation, for its banner. */
  on: Record<string, GroupCallView>;
  patch: (p: Partial<Omit<GroupCallStore, 'patch' | 'peer' | 'seen' | 'reset' | 'on'>>) => void;
  /** Update one other device's tile. */
  peer: (key: string, p: Partial<GroupPeer> | null) => void;
  /** What the server said about a call in one of the person's groups. */
  seen: (call: GroupCallView) => void;
  reset: () => void;
}

const idle = {
  call: null,
  phase: null,
  local: null,
  peers: {},
  muted: false,
  cameraOff: false,
  sharing: false,
  note: null,
};

export const useGroupCall = create<GroupCallStore>((set) => ({
  ...idle,
  on: {},
  patch: (p) => set(p),
  peer: (key, p) =>
    set((s) => {
      const peers = { ...s.peers };
      if (p === null) delete peers[key];
      else {
        const was = peers[key];
        if (!was && !(p.person && p.device)) return {};
        peers[key] = {
          key,
          stream: null,
          link: 'connecting',
          theirs: null,
          ...was,
          ...p,
        } as GroupPeer;
      }
      return { peers };
    }),
  seen: (call) =>
    set((s) => {
      const on = { ...s.on };
      const was = on[call.conversationId];
      // An older call's news never replaces the one on now, nor older news of the same call.
      if (was && was.id !== call.id && Date.parse(was.createdAt) > Date.parse(call.createdAt))
        return {};
      if (was?.id === call.id && call.rev < was.rev) return {};
      if (call.state === 'ended') {
        if (was?.id === call.id) delete on[call.conversationId];
      } else on[call.conversationId] = call;
      return { on };
    }),
  reset: () => set(idle),
}));
