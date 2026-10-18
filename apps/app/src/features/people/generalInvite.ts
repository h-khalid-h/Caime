/**
 * A person's general invite link (R1): their live one with no relationship or note, else one
 * made now. Contacts' invitations and onboarding's "Share your link" send this same link, so a
 * person has one to take back, never one per tap; opened, it connects (or asks, R29) at once,
 * where the bare @handle only finds them (review 2026-10-17 §1 M).
 */
import { endpoints } from '@/api/endpoints';

export async function generalInviteUrl(): Promise<string> {
  const { invites } = await endpoints.invites();
  const general = invites.find(
    (i) => !i.relationship && !i.note && new Date(i.expiresAt).getTime() > Date.now(),
  );
  if (general) return general.url;
  return (await endpoints.makeInvite({})).invite.url;
}
