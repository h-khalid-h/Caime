/**
 * The phone's bar of places: its pill's height, the room above it, and how far it stands off
 * the bottom of a screen with no home indicator. Here, in a module of its own, so what stands off
 * the bar (the screen's toasts) reads it without pulling the bar into the shared chunk (the
 * budget).
 */
export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_TOP = 6;
export const TAB_BAR_GAP = 16;

/** How much of the screen's bottom the bar takes, below the home indicator's own room. */
export const tabBarRoom = (insetBottom: number) =>
  TAB_BAR_TOP + TAB_BAR_HEIGHT + Math.max(insetBottom, TAB_BAR_GAP) - insetBottom;
