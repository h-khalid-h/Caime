import { createElement, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useCall } from '@/state/calls';
import { useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import type { IconComponent } from '@/ui/Button';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { answer, checkLiveCall, hangUp, toggleCamera, toggleMute } from './engine';

const INK = '#0B0B12';
/** Readable over whatever the other camera shows. */
const OVER_VIDEO = {
  textShadowColor: '#00000099',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
};

/** A camera or a voice, played: the remote one with sound, this device's own muted. */
function Media({
  stream,
  video,
  mine,
  testID,
}: {
  stream: MediaStream;
  video: boolean;
  mine?: boolean;
  testID: string;
}) {
  // A callback ref: when the voice becomes a picture, the new element gets the stream too.
  const attach = useCallback(
    (el: HTMLMediaElement | null) => {
      if (el && el.srcObject !== stream) el.srcObject = stream;
    },
    [stream],
  );
  return createElement(video ? 'video' : 'audio', {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted: mine,
    'data-testid': testID,
    style: video
      ? {
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mine ? 'scaleX(-1)' : undefined,
          display: 'block',
        }
      : { display: 'none' },
  });
}

function Round({
  icon: Icon,
  label,
  onPress,
  tone = 'plain',
  on = false,
  testID,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'end' | 'go';
  on?: boolean;
  testID: string;
}) {
  const bg = tone === 'end' ? '#E5484D' : tone === 'go' ? '#30A46C' : on ? '#FFFFFF' : '#FFFFFF29';
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon size={26} color={on ? INK : '#FFFFFF'} />
      </Pressable>
      <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
        {label}
      </Text>
    </View>
  );
}

/** "0:42", "12:05", "1:02:05": how long it's been since it was answered. */
function useElapsed(since: string | null, running: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const mm = String(Math.floor(s / 60) % 60).padStart(s >= 3600 ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The call screen (PRD §47), over everything while a call rings or runs: who it's with, how
 * long it's been, and the three things you do in a call: mute, camera, hang up.
 */
export function CallLayer() {
  const me = useSession((s) => s.user?.id ?? '');
  const { call, phase, local, remote, muted, cameraOff, note } = useCall();
  useEffect(() => {
    if (me) void checkLiveCall(me);
  }, [me]);
  const elapsed = useElapsed(call?.answeredAt ?? null, phase === 'active');
  if (!call || !phase || phase === 'starting') return null;

  const other = call.caller.id === me ? call.callee : call.caller;
  const video = call.kind === 'video';
  const seeThem = video && phase === 'active' && remote?.getVideoTracks().length;
  const status =
    phase === 'incoming'
      ? video
        ? 'Video call'
        : 'Voice call'
      : phase === 'outgoing'
        ? 'Calling…'
        : phase === 'connecting'
          ? 'Connecting…'
          : phase === 'reconnecting'
            ? 'Reconnecting…'
            : phase === 'ended'
              ? (note ?? 'Call ended')
              : elapsed;

  return (
    <View
      accessibilityViewIsModal
      testID="call-screen"
      style={{
        position: 'fixed' as 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: INK,
      }}
    >
      {remote && phase !== 'ended' ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Media stream={remote} video={Boolean(seeThem)} testID="call-remote" />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: seeThem ? 'flex-start' : 'center',
          paddingTop: seeThem ? 24 : 0,
          gap: 10,
        }}
      >
        {seeThem ? null : (
          <Avatar id={other.id} name={other.displayName} url={other.avatarUrl} size={112} />
        )}
        <Text variant="title" style={{ color: '#FFFFFF', ...OVER_VIDEO }} numberOfLines={1}>
          {other.displayName}
        </Text>
        <Text variant="body" style={{ color: '#FFFFFFDD', ...OVER_VIDEO }} testID="call-status">
          {phase === 'incoming' ? `${status} · calling you` : status}
        </Text>
      </View>
      {video && local && !cameraOff && phase !== 'incoming' && phase !== 'ended' ? (
        <View
          style={{
            position: 'absolute',
            // Above the controls, clear of the name at the top on a narrow screen.
            bottom: 140,
            right: 16,
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
            paddingBottom: 40,
            paddingTop: 16,
          }}
          testID={phase === 'incoming' ? 'call-incoming' : 'call-controls'}
        >
          {phase === 'incoming' ? (
            <>
              <Round
                icon={PhoneOff}
                label="Decline"
                tone="end"
                onPress={() => void hangUp()}
                testID="call-decline"
              />
              <Round
                icon={video ? Video : Phone}
                label="Answer"
                tone="go"
                onPress={() => void answer()}
                testID="call-accept"
              />
            </>
          ) : (
            <>
              <Round
                icon={muted ? MicOff : Mic}
                label={muted ? 'Unmute' : 'Mute'}
                on={muted}
                onPress={toggleMute}
                testID="call-mute"
              />
              {video ? (
                <Round
                  icon={cameraOff ? VideoOff : Video}
                  label={cameraOff ? 'Camera on' : 'Camera off'}
                  on={cameraOff}
                  onPress={toggleCamera}
                  testID="call-camera"
                />
              ) : null}
              <Round
                icon={PhoneOff}
                label={phase === 'outgoing' ? 'Cancel' : 'Hang up'}
                tone="end"
                onPress={() => void hangUp()}
                testID="call-hangup"
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}
