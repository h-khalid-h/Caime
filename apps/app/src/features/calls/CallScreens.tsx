import { tr } from '@caime/core/i18n';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall } from '@/state/calls';
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
import {
  answer,
  hangUp,
  screenShareSupported,
  startSharing,
  stopSharing,
  toggleCamera,
  toggleMute,
} from './engine';
import { GroupCallLayer } from './GroupCallLayer';

/**
 * The call screen (PRD §47), over everything while a call rings or runs: who it's with, how
 * long it's been, and the three things you do in a call: mute, camera, hang up.
 */
function OneToOneCallLayer() {
  const me = useSession((s) => s.user?.id ?? '');
  const { call, phase, local, remote, muted, cameraOff, sharing, theirs, note } = useCall();
  const elapsed = useElapsed(call?.answeredAt ?? null, phase === 'active');
  useRingtone(phase === 'incoming');
  // Clear of a phone's notch and home indicator (nothing on the web).
  const insets = useSafeAreaInsets();
  // A phone's sound, from when the two are connecting until the call is over.
  const audio = useCallAudio(
    phase === 'connecting' || phase === 'active' || phase === 'reconnecting',
    call?.kind === 'video',
  );
  // Keyboard and screen reader users land on what to do now: answer, or hang up.
  const primary = useRef<View>(null);
  useEffect(() => {
    if (phase === 'incoming' || phase === 'outgoing' || phase === 'active')
      (primary.current as unknown as HTMLElement | null)?.focus?.();
  }, [phase]);
  const shown = Boolean(call && phase && phase !== 'starting');
  const root = useFocusInside(shown);
  if (!call || !phase || phase === 'starting') return null;

  const other = call.caller.id === me ? call.callee : call.caller;
  const video = call.kind === 'video';
  // Their screen when they share it; their camera in a video call, unless they turned it off.
  const theyShare = Boolean(theirs?.sharing);
  const seeThem =
    phase === 'active' &&
    Boolean(remote?.getVideoTracks().length) &&
    (theyShare || (video && theirs?.camera !== false));
  const status =
    phase === 'incoming'
      ? video
        ? tr('Video call')
        : tr('Voice call')
      : phase === 'outgoing'
        ? 'Calling…'
        : phase === 'connecting'
          ? 'Connecting…'
          : phase === 'reconnecting'
            ? 'Reconnecting…'
            : phase === 'ended'
              ? (note ?? tr('Call ended'))
              : elapsed;

  const hasCamera = Boolean(local?.getVideoTracks().length);

  return (
    <View
      ref={root}
      role={phase === 'incoming' ? 'alertdialog' : 'dialog'}
      aria-modal
      aria-label={
        video
          ? tr('Video call with {name}', { name: other.displayName })
          : tr('Voice call with {name}', { name: other.displayName })
      }
      testID="call-screen"
      style={{
        ...OVER_APP,
        backgroundColor: INK,
      }}
    >
      {remote && phase !== 'ended' ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Media
            stream={remote}
            video={seeThem}
            fit={theyShare ? 'contain' : 'cover'}
            testID="call-remote"
          />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: seeThem ? 'flex-start' : 'center',
          paddingTop: (seeThem ? 24 : 0) + insets.top,
          gap: 10,
        }}
      >
        {seeThem ? null : (
          <Avatar id={other.id} name={other.displayName} url={other.avatarUrl} size={112} />
        )}
        <Text variant="title" style={{ color: '#FFFFFF', ...OVER_VIDEO }} numberOfLines={1}>
          {other.displayName}
        </Text>
        {phase === 'active' && (theyShare || theirs?.muted) ? (
          <Text
            variant="caption"
            style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
            testID="call-theirs"
          >
            {[
              theyShare
                ? tr('{other} is sharing their screen', { other: other.displayName.split(' ')[0] })
                : null,
              theirs?.muted ? 'Muted' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <Text
          variant="body"
          style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
          // What's happening is said (calling, connecting, how it ended); the running clock isn't.
          aria-live={phase === 'active' ? 'off' : 'polite'}
          role={phase === 'active' ? 'timer' : undefined}
          testID="call-status"
        >
          {phase === 'incoming' ? tr('{status} · calling you', { status }) : status}
        </Text>
      </View>
      {sharing && phase === 'active' ? (
        <View
          style={{
            position: 'absolute',
            bottom: 140 + insets.bottom,
            end: 16,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: '#FFFFFF29',
          }}
          testID="call-you-share"
        >
          <Text variant="caption" style={{ color: '#FFFFFF' }}>
            {tr('You’re sharing your screen')}
          </Text>
        </View>
      ) : video && local && hasCamera && !cameraOff && phase !== 'incoming' && phase !== 'ended' ? (
        <View
          style={{
            position: 'absolute',
            // Above the controls, clear of the name at the top on a narrow screen.
            bottom: 140 + insets.bottom,
            end: 16,
            width: 112,
            height: 156,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#FFFFFF33',
          }}
        >
          <Media stream={local} video mine testID="call-local" />
        </View>
      ) : null}
      {phase === 'ended' ? null : (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 28,
            paddingBottom: 40 + insets.bottom,
            paddingTop: 16,
          }}
          testID={phase === 'incoming' ? 'call-incoming' : 'call-controls'}
        >
          {phase === 'incoming' ? (
            <>
              <Round
                icon={PhoneOff}
                label={tr('Decline')}
                tone="end"
                onPress={() => void hangUp()}
                testID="call-decline"
              />
              <Round
                icon={video ? Video : Phone}
                label={tr('Answer')}
                tone="go"
                onPress={() => void answer()}
                focusRef={primary}
                testID="call-accept"
              />
            </>
          ) : (
            <>
              <Round
                icon={muted ? MicOff : Mic}
                label={muted ? tr('Unmute') : tr('Mute')}
                on={muted}
                onPress={toggleMute}
                testID="call-mute"
              />
              {audio.speaker !== null ? (
                <Round
                  icon={Volume2}
                  label={audio.speaker ? tr('Speaker off') : tr('Speaker')}
                  on={audio.speaker}
                  onPress={audio.toggleSpeaker}
                  testID="call-speaker"
                />
              ) : null}
              {screenShareSupported && phase === 'active' ? (
                <Round
                  icon={sharing ? ScreenShareOff : ScreenShare}
                  label={sharing ? tr('Stop sharing') : tr('Share screen')}
                  on={sharing}
                  onPress={() => void (sharing ? stopSharing() : startSharing())}
                  testID="call-share"
                />
              ) : null}
              {video && hasCamera ? (
                <Round
                  icon={cameraOff ? VideoOff : Video}
                  label={cameraOff ? tr('Camera on') : tr('Camera off')}
                  on={cameraOff}
                  onPress={toggleCamera}
                  testID="call-camera"
                />
              ) : null}
              <Round
                icon={PhoneOff}
                label={phase === 'outgoing' ? tr('Cancel') : tr('Hang up')}
                tone="end"
                onPress={() => void hangUp()}
                focusRef={primary}
                testID="call-hangup"
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * The call screens: a 1:1 call's, and a group call's. One call at a time is ever on a device.
 * Loaded with the calls themselves when there's one to show (CallLayer.tsx).
 */
export function CallScreens() {
  return (
    <>
      <OneToOneCallLayer />
      <GroupCallLayer />
    </>
  );
}
