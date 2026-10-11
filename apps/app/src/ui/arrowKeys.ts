/**
 * Arrow keys in a group of choices on the web (R77): in a radio group, a tablist or a row of
 * chips, Left and Right (Up and Down too) move the keyboard's focus to the next or previous
 * option and, where moving chooses (radios, tabs), choose it, as a native radio group does;
 * Home and End go to the ends. The group's own key handler, so each option stays a plain
 * pressable; a checkbox group passes no `choose` and only moves. With a roving tab index
 * (`rovingTabIndex`) Tab lands on the one chosen and the arrows walk the rest, so a long row
 * is one stop, not twelve.
 */
import { Platform } from 'react-native';
import type { KeyEvent } from './Pressable';

const OPTIONS = '[role="radio"],[role="tab"],[role="checkbox"]';

type Focusable = { focus: () => void };
type GroupEvent = KeyEvent & {
  currentTarget?: { querySelectorAll?: (selector: string) => ArrayLike<Focusable> };
};

export function arrowKeyMoves({
  rtl,
  choose,
}: {
  /** The layout runs right to left: Left is forward. */
  rtl: boolean;
  /** Called with the option moved to, where moving chooses. */
  choose?: (index: number) => void;
}): { onKeyDown?: (e: KeyEvent) => void } {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (raw: KeyEvent) => {
      const e = raw as GroupEvent;
      const key = e.nativeEvent?.key ?? e.key;
      const forward = key === 'ArrowDown' || key === (rtl ? 'ArrowLeft' : 'ArrowRight');
      const back = key === 'ArrowUp' || key === (rtl ? 'ArrowRight' : 'ArrowLeft');
      if (!forward && !back && key !== 'Home' && key !== 'End') return;
      const all = e.currentTarget?.querySelectorAll?.(OPTIONS);
      if (!all || all.length < 2 || typeof document === 'undefined') return;
      const items = Array.from(all);
      const at = items.indexOf(document.activeElement as unknown as Focusable);
      if (at < 0) return;
      const next =
        key === 'Home'
          ? 0
          : key === 'End'
            ? items.length - 1
            : (at + (forward ? 1 : -1) + items.length) % items.length;
      e.preventDefault?.();
      items[next]?.focus();
      choose?.(next);
    },
  };
}

/**
 * The tab index of one option in a group where one is chosen: the chosen one is the group's
 * one stop (the first, while none is), and the arrows reach the rest.
 */
export function rovingTabIndex(chosen: boolean, first: boolean, anyChosen: boolean): 0 | -1 {
  return chosen || (!anyChosen && first) ? 0 : -1;
}
