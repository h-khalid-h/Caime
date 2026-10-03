import type { CallPersonView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type GroupPeer, useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  Volume2,
} from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useCallAudio } from './callAudio';
import {
  INK,
  Media,
  OVER_APP,
  OVER_VIDEO,
  Round,
  useElapsed,
  useFocusInside,
  useRingtone,
} from './callUi';
import { screenShareSupported } from './engine';
import {
  joinGroupCall,
  leaveGroupCall,
  startGroupSharing,
  stopGroupSharing,
  toggleGroupCamera,
  toggleGroupMute,
} from './group';

const first = (name: string) => name.split(' ')[0] ?? name;

/** One person's square in the call: their camera or screen, or their photo, and their name. */
function Tile({
  person,
  stream,
  picture,
  fit = 'cover',
  mine = false,
  muted = false,
  note,
  big = false,
  testID,
}: {
  person: CallPersonView;
  stream: MediaStream | null;
  /** Their camera or screen is on and arriving: shown instead of the photo. */
  picture: boolean;
  fit?: 'cover' | 'contain';
  mine?: boolean;
  muted?: boolean;
  /** Connecting, sharing a screen: what's worth saying under the name. */
  note?: string | null;
  big?: boolean;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      aria-label={[mine ? 'You' : person.displayName, muted ? 'muted' : null, note]
        .filter(Boolean)
        .join(', ')}
      style={{
        flex: 1,
        margin: 4,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF14',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: big ? 220 : 120,
      }}
    >
      {stream ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: picture ? 'flex' : 'none',
          }}
        >
          {/* With no picture, the voice still plays: an audio element, hidden. */}
          <Media
            stream={stream}
            video={picture}
            mine={mine}
            fit={fit}
            testID={mine ? 'group-call-local' : 'group-call-remote'}
          />
        </View>
      ) : null}
      {picture ? null : (
        <Avatar
          id={person.id}
          name={person.displayName}
          url={person.avatarUrl}
          size={big ? 96 : 64}
        />
      )}
      <View
        style={{
          position: 'absolute',
          start: 10,
          bottom: 8,
          end: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {muted ? <MicOff size={14} color="#FFFFFF" /> : null}
        <Text variant="caption" style={{ color: '#FFFFFF', ...OVER_VIDEO }} numberOfLines={1}>
          {[mine ? 'You' : person.displayName, note].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

/** How a connection to another device reads on its tile, while it isn't simply on. */
const linkNote = (p: GroupPeer) =>
  p.link === 'connecting'
    ? 'Connecting…'
    : p.link === 'reconnecting'
      ? 'Reconnecting…'
      : p.link === 'failed'
        ? tr('Couldn’t connect')
        : p.theirs?.sharing
          ? `${first(p.person.displayName)} is sharing their screen`
          : null;

/**
 * A group call's screen (PRD §47), over everything while it rings or runs: who's calling where,
 * then everyone in it, each on their own tile, and mute, share, camera and leave.
 */
export function GroupCallLayer() {
  const me = useSession((s) => s.user);
  const { call, phase, local, peers, muted, cameraOff, sharing, note } = useGroupCall();
  const elapsed = useElapsed(call?.answeredAt ?? null, phase === 'in');
  useRingtone(phase === 'incoming');
  // Clear of a phone's notch and home indicator (nothing on the web).
  const insets = useSafeAreaInsets();
  // A phone's sound, while it's in the call.
  const audio = useCallAudio(phase === 'in', call?.kind === 'video');
  const primary = useRef<View>(null);
  useEffect(() => {
    if (phase === 'incoming' || phase === 'in')
      (primary.current as unknown as HTMLElement | null)?.focus?.();
  }, [phase]);
  const shown = Boolean(call && phase && phase !== 'starting');
  const root = useFocusInside(shown);
  if (!call || !phase || phase === 'starting' || !me) return null;

  const video = call.kind === 'video';
  const where = call.conversationTitle ?? 'the group';
  const others = Object.values(peers);
  const joined = call.members.filter((m) => m.state === 'joined');
  const hasCamera = Boolean(local?.getVideoTracks().length);
  const kindName = video ? tr('Group video call') : tr('Group voice call');
  const status =
    phase === 'incoming'
      ? tr('{displayName} is calling · {kindName}', {
          displayName: call.startedBy.displayName,
          kindName,
        })
      : phase === 'joining'
        ? 'Joining…'
        : phase === 'ended'
          ? (note ?? tr('Call ended'))
          : others.length
            ? elapsed
            : call.state === 'ringing'
              ? 'Calling…'
              : tr('Waiting for others…');
  // A shared screen is shown large, with everyone else beside it.
  const spotlight = others.find((p) => p.theirs?.sharing && p.link === 'connected') ?? null;
  const picture = (p: GroupPeer) =>
    p.link === 'connected' &&
    Boolean(p.stream?.getVideoTracks().length) &&
    (p.theirs?.sharing === true || (video && p.theirs?.camera !== false));
  const mineShown = video && hasCamera && !cameraOff && !sharing;
  const tiles = [
    ...others
      .filter((p) => p !== spotlight)
      .map((p) => (
        <Tile
          key={p.key}
          person={p.person}
          stream={p.stream}
          picture={picture(p)}
          muted={p.theirs?.muted}
          note={linkNote(p)}
          testID="group-call-tile"
        />
      )),
    <Tile
      key="me"
      person={{ id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl ?? null }}
      stream={local}
      picture={mineShown}
      mine
      muted={muted}
      note={sharing ? tr('You’re sharing your screen') : null}
      testID="group-call-me"
    />,
  ];
  // Two across up to four tiles, three across beyond.
  const across = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3;
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += across) rows.push(tiles.slice(i, i + across));

  return (
    <View
      ref={root}
      role={phase === 'incoming' ? 'alertdialog' : 'dialog'}
      aria-modal
      aria-label={`${kindName} in ${where}`}
      testID="group-call-screen"
      style={{
        ...OVER_APP,
        backgroundColor: INK,
      }}
    >
      <View
        style={{ alignItems: 'center', paddingTop: 20 + insets.top, paddingHorizontal: 16, gap: 4 }}
      >
        <Text variant="title" style={{ color: '#FFFFFF' }} numberOfLines={1}>
          {where}
        </Text>
        <Text
          variant="body"
          style={{ color: '#FFFFFFDD' }}
          aria-live={phase === 'in' && others.length ? 'off' : 'polite'}
          role={phase === 'in' && others.length ? 'timer' : undefined}
          testID="group-call-status"
        >
          {status}
        </Text>
        {phase === 'in' ? (
          <Text variant="caption" style={{ color: '#FFFFFFAA' }} testID="group-call-count">
            {joined.length === 1
              ? tr('Only you so far')
              : tr('{length} in the call', { length: joined.length })}
          </Text>
        ) : null}
      </View>

      {phase === 'incoming' || phase === 'joining' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {joined.slice(0, 4).map((m) => (
              <Avatar
                key={m.person.id}
                id={m.person.id}
                name={m.person.displayName}
                url={m.person.avatarUrl}
                size={72}
              />
            ))}
          </View>
          <Text variant="body" style={{ color: '#FFFFFFCC' }} testID="group-call-who">
            {joined.length === 1
              ? tr('{first} is in the call', { first: first(joined[0]?.person.displayName ?? '') })
              : tr('{join}{text} are in the call', {
                  join: joined
                    .slice(0, 3)
                    .map((m) => first(m.person.displayName))
                    .join(', '),
                  text: joined.length > 3 ? ` and ${joined.length - 3} more` : '',
                })}
          </Text>
        </View>
      ) : phase === 'ended' ? (
        <View style={{ flex: 1 }} />
      ) : (
        <View style={{ flex: 1, padding: 8 }} testID="group-call-grid">
          {spotlight ? (
            <View style={{ flex: 3 }}>
              <Tile
                person={spotlight.person}
                stream={spotlight.stream}
                picture
                fit="contain"
                muted={spotlight.theirs?.muted}
                note={linkNote(spotlight)}
                big
                testID="group-call-spotlight"
              />
            </View>
          ) : null}
          {spotlight ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>{tiles}</View>
          ) : (
            rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positions, not items
              <View key={i} style={{ flex: 1, flexDirection: 'row' }}>
                {row}
                {/* A short last row keeps its tiles the size of the others. */}
                {Array.from({ length: across - row.length }, (_, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fillers have no identity
                  <View key={`gap-${j}`} style={{ flex: 1, margin: 4 }} />
                ))}
              </View>
            ))
          )}
        </View>
      )}

      {phase === 'ended' ? null : (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 28,
            paddingBottom: 32 + insets.bottom,
            paddingTop: 12,
          }}
          testID={phase === 'incoming' ? 'group-call-incoming' : 'group-call-controls'}
        >
          {phase === 'incoming' ? (
            <>
              <Round
                icon={PhoneOff}
                label={tr('Decline')}
                tone="end"
                onPress={() => void leaveGroupCall()}
                testID="group-call-decline"
              />
              <Round
                icon={video ? Video : Phone}
                label={tr('Join')}
                tone="go"
                onPress={() => void joinGroupCall()}
                focusRef={primary}
                testID="group-call-join"
              />
            </>
          ) : (
            <>
              <Round
                icon={muted ? MicOff : Mic}
                label={muted ? tr('Unmute') : tr('Mute')}
                on={muted}
                onPress={toggleGroupMute}
                testID="group-call-mute"
              />
              {audio.speaker !== null ? (
                <Round
                  icon={Volume2}
                  label={audio.speaker ? tr('Speaker off') : tr('Speaker')}
                  on={audio.speaker}
                  onPress={audio.toggleSpeaker}
                  testID="group-call-speaker"
                />
              ) : null}
              {screenShareSupported && phase === 'in' ? (
                <Round
                  icon={sharing ? ScreenShareOff : ScreenShare}
                  label={sharing ? tr('Stop sharing') : tr('Share screen')}
                  on={sharing}
                  onPress={() => void (sharing ? stopGroupSharing() : startGroupSharing())}
                  testID="group-call-share"
                />
              ) : null}
              {video && hasCamera ? (
                <Round
                  icon={cameraOff ? VideoOff : Video}
                  label={cameraOff ? tr('Camera on') : tr('Camera off')}
                  on={cameraOff}
                  onPress={toggleGroupCamera}
                  testID="group-call-camera"
                />
              ) : null}
              <Round
                icon={PhoneOff}
                label={tr('Leave')}
                tone="end"
                onPress={() => void leaveGroupCall()}
                focusRef={primary}
                testID="group-call-leave"
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}
