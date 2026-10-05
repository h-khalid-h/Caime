/**
 * The Attention home (R66): what the first screen says, worked out once for the app and its
 * tests. Pure, no zod: the app takes it by subpath.
 */
import type { InboxItemView, SpaceRef } from './api';
import { msg, tr, trn } from './i18n';
import { zonedParts } from './time';

/** The greeting for the reader's own hour, as a key ("Good morning, {name}"). */
export function greetingKey(now: Date, timeZone: string): string {
  let hour = 12;
  try {
    hour = zonedParts(now, timeZone).hour;
  } catch {
    hour = now.getUTCHours();
  }
  if (hour >= 5 && hour < 12) return msg('Good morning, {name}');
  if (hour >= 12 && hour < 18) return msg('Good afternoon, {name}');
  return msg('Good evening, {name}');
}

/** The first word of a display name, for the greeting ("Hassan" of "Hassan Khalid"). */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** One line of the home: a conversation, or several in one space folded together. */
export type HomeEntry =
  | { kind: 'one'; item: InboxItemView }
  | { kind: 'space'; space: SpaceRef; items: InboxItemView[] };

/**
 * What needs the reader, with a space's conversations folded into one line when two or more of
 * them need it ("Venue · 3 things"), in the order the first of them came.
 */
export function homeEntries(items: InboxItemView[]): HomeEntry[] {
  const bySpace = new Map<string, InboxItemView[]>();
  for (const item of items)
    if (item.space) bySpace.set(item.space.id, [...(bySpace.get(item.space.id) ?? []), item]);
  const out: HomeEntry[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const group = item.space ? bySpace.get(item.space.id) : undefined;
    if (item.space && group && group.length > 1) {
      if (placed.has(item.space.id)) continue;
      placed.add(item.space.id);
      out.push({ kind: 'space', space: item.space, items: group });
    } else out.push({ kind: 'one', item });
  }
  return out;
}

/** What the home says at its top: how many things need the reader, or that nothing does. */
export function homeSummary(needs: number): string {
  if (needs === 0) return tr('Nothing needs you right now.');
  return trn(needs, '{n} thing needs you.', '{n} things need you.');
}
