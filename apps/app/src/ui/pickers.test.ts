import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One family of pickers (R77): a choice is `ChoiceChips`, `ChoiceList`, `ChoiceSheet`,
 * `SpherePicker`, `PickerField` + `SearchSheet`, a `Segmented` (views only), a `SwitchRow`, a
 * `Stepper` or a date, time or year field, every one in `ui/`. A screen never builds its own: a
 * `Chip` that selects, a radio, a checkbox, a tab or a switch written by hand, or a field's
 * 48-px shell drawn again. What a screen may still write itself is listed here with its reason.
 */
const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'ui' ? [] : sources(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });

/** A role a screen writes itself, and why it isn't one of the family's. */
const ALLOWED: Record<string, string> = {
  'app/(app)/settings/appearance.tsx':
    'the bubble colours are swatches and the styles are cards with a character: visual radios, on the group helpers (arrow keys, one stop)',
  'features/actions/TaskRow.tsx': 'a task’s own done box, in its row',
  'features/account/RecoveryCodesSheet.tsx': 'the one acknowledgement that the codes are saved',
  'features/shell/TabBar.tsx': 'the phone’s bar of places is navigation, not a choice',
  'features/conversation/ContextPanel.tsx': 'a context’s own “shown to them” box, in its row',
  'features/kits/ChecklistCard.tsx': 'a checklist’s items are the card’s content',
  'features/kits/SplitCard.tsx': 'a share settled is the card’s content',
  'features/auth/AuthLayout.tsx': 'the entry screens’ header row, not a field',
};

const BESPOKE = [
  /<Chip\b[^>]*\bselected=/s,
  /<Chip\b[^>]*\brole="(radio|checkbox)"/s,
  /accessibilityRole="(radiogroup|radio|checkbox|tablist|tab)"/,
  /\brole="(radiogroup|radio|checkbox|tablist|tab)"/,
  /<Switch\b/,
  /minHeight: (48|controlHeight\.field)\b/,
];

describe('pickers', () => {
  it('are the family’s, never a screen’s own', () => {
    const wrong = sources(root).flatMap((path) => {
      const file = relative(root, path);
      if (ALLOWED[file]) return [];
      const text = readFileSync(path, 'utf8');
      const hits = BESPOKE.filter((re) => re.test(text));
      return hits.length ? [`${file}: ${hits.map(String).join(', ')}`] : [];
    });
    expect(wrong).toEqual([]);
  });

  it('allow only what is still written by hand', () => {
    const stale = Object.keys(ALLOWED).filter((file) => {
      const text = readFileSync(join(root, file), 'utf8');
      return !BESPOKE.some((re) => re.test(text));
    });
    expect(stale).toEqual([]);
  });
});
