import { type ReactNode, useRef } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';
import { useRtl } from '@/lib/direction';
import { useReduceMotion } from '@/lib/motion';

/** How far a message is drawn before letting go answers it: a thumb's width. */
const REPLY_AT = 64;
/** The furthest it follows the finger. */
const FOLLOWS_TO = 96;

/**
 * Swipe a message toward the reading direction's end to answer it (M16 E2: right, or left in
 * Arabic), as every phone's messenger does: past a thumb's width it replies, and it springs back
 * either way. A sideways move only: one that's more up than across is the list's to scroll. On
 * the web the hover's Reply does it.
 */
export function SwipeToReply({
  onReply,
  enabled,
  children,
}: {
  onReply: () => void;
  enabled: boolean;
  children: ReactNode;
}) {
  if (Platform.OS === 'web' || !enabled) return children;
  return <Swipe onReply={onReply}>{children}</Swipe>;
}

function Swipe({ onReply, children }: { onReply: () => void; children: ReactNode }) {
  const rtl = useRtl();
  const reduceMotion = useReduceMotion();
  const dx = useRef(new Animated.Value(0)).current;
  // The latest of what may change while the responder made once stays the same.
  const latest = useRef({ onReply, reduceMotion, toward: rtl ? -1 : 1 });
  latest.current = { onReply, reduceMotion, toward: rtl ? -1 : 1 };
  const back = () => {
    if (latest.current.reduceMotion) dx.setValue(0);
    else Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  };
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx * latest.current.toward > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => {
        const toward = latest.current.toward;
        dx.setValue(Math.max(0, Math.min(g.dx * toward, FOLLOWS_TO)) * toward);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx * latest.current.toward >= REPLY_AT) latest.current.onReply();
        back();
      },
      onPanResponderTerminate: back,
    }),
  ).current;
  return (
    <Animated.View style={{ transform: [{ translateX: dx }] }} {...responder.panHandlers}>
      {children}
    </Animated.View>
  );
}
