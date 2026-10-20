/**
 * A meeting or an appointment as a calendar shows it (R96, M16 F6): one wording for what Caime
 * writes into someone's connected Google or Outlook calendar (`calendar-push.ts`) and for the feed
 * their calendar app reads (`modules/calendar.ts`), in their own language (called inside
 * `asReader`). Its title is the card's and whom it's with, never the same words twice: a meeting's
 * own space (R84) is named by the meeting, so its people are named instead. The description names
 * whom it's with, says how to join it here or open it in Caime, whether Cai takes notes in its call
 * (M16 F7c), and that Caime keeps it; one held here (core `heldOnCaime`) has its join address for
 * its place, which the calendar opens. Nobody is invited by it: Caime's own invitations reach the
 * people it's with, and each of them on Caime has their own calendar written. An organization
 * that keeps its conversations from its team's own apps (M16 G3b) gets its kind, its name and the
 * time, never who or where.
 */
import { KITS } from '@caime/core';
import { foldForFind } from '@caime/core/fold';
import { joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { joinPath } from '@caime/core/meetings';
import type { ConversationAbout } from './calendar';
import type { CardAhead } from './upcoming';

/** What a calendar event says of a card. */
export interface CardEventText {
  summary: string;
  description: string;
  location: string | null;
  /** Where it opens: its join address when it's held here, else its conversation. */
  url: string;
  /** Joined here: its Join opens its call. */
  here: boolean;
}

/** The most names a description lists before it counts the rest (a group call's room). */
const LISTED = 8;

const same = (a: string, b: string) => foldForFind(a.trim()) === foldForFind(b.trim());

/**
 * The people a card is with, for its reader, by name: the organization to its customer and the
 * customer to its team (R15: never who on the team), the other person in a chat, the people of a
 * group. Empty when there's nobody to name.
 */
export function namesWith(about: ConversationAbout | undefined, viewerId: string): string[] {
  if (!about) return [];
  if (about.org || about.kind === 'business') {
    if (about.customer && about.customer.id !== viewerId) return [about.customer.name];
    return about.org ? [about.org.name] : [];
  }
  return about.names;
}

/** What follows its title: whom it's with, said once (a space named by the card names its people). */
function whomShort(about: ConversationAbout | undefined, viewerId: string, title: string) {
  const names = namesWith(about, viewerId);
  if (about?.title && !same(about.title, title)) return about.title;
  return names.length ? joinNames(names) : null;
}

export function cardEventText(
  card: CardAhead,
  about: ConversationAbout | undefined,
  viewerId: string,
  base: string,
  /** The organization's name, when it keeps its conversations from its team's own apps. */
  kept: string | undefined,
): CardEventText {
  const here = card.hasTime && !card.projected && card.heldHere;
  const url = here
    ? `${base}${joinPath(card.conversationId, card.seq, card.messageId)}`
    : `${base}/c/${card.conversationId}`;
  const how = here ? tr('Join in Caime: {url}', { url }) : tr('Open in Caime: {url}', { url });
  const keeps = tr('Caime keeps this up to date. Change it in Caime.');
  const asked = card.agreed ? null : tr('Asked, not agreed yet.');
  const kind = tr(KITS[card.kit].name);
  if (kept)
    return {
      summary: `${kind} · ${kept}`,
      description: [asked, how, keeps].filter(Boolean).join('\n\n'),
      location: here ? url : null,
      url,
      here,
    };
  // A card without a title of its own is named by its kind, in the reader's words.
  const title = card.title === 'Meeting' || card.title === 'Appointment' ? kind : card.title;
  const whom = whomShort(about, viewerId, title);
  const names = namesWith(about, viewerId);
  return {
    summary: whom ? `${title} · ${whom}` : title,
    description: [
      asked,
      names.length ? tr('With {names}', { names: joinNames(names, LISTED) }) : null,
      how,
      // Said wherever the meeting is (M16 F7c): everyone is asked again as they join.
      card.notes && here ? tr('Cai takes notes in the call, once everyone in it says yes.') : null,
      keeps,
    ]
      .filter(Boolean)
      .join('\n\n'),
    location: here ? url : card.place,
    url,
    here,
  };
}
