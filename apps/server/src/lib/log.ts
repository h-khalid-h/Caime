/**
 * What a request says of itself in the server's log: its method, its path and who asked. Never
 * its query string (search terms, handles), and never a secret that's part of its path: a
 * calendar feed's address is what lets a calendar read it, so it's masked.
 */
const CALENDAR_FEED = /\/calendar\/cal_[^/]*$/;
/** An invite's token is the only key to it (R1): `/i/<token>`, `/v1/invites/<token>[/accept]`. */
const INVITE_TOKEN = /\/(i|invites)\/[^/]{16,}(?=\/|$)/;
/** A meeting guest's link is their way in (R84): `/j/<token>`, `/v1/join/<token>`. */
const GUEST_TOKEN = /\/(j|join)\/[^/]{16,}(?=\/|$)/;
/** A mail's "Open in Caime" link (R75): `/v1/mail/seen/<token>`. */
const MAIL_SEEN = /\/mail\/seen\/[^/]+$/;

export function requestForLog(req: { method: string; url: string; ip?: string }) {
  return {
    method: req.method,
    url: req.url
      .split('?')[0]
      ?.replace(CALENDAR_FEED, '/calendar/cal_….ics')
      .replace(INVITE_TOKEN, '/$1/…')
      .replace(GUEST_TOKEN, '/$1/…')
      .replace(MAIL_SEEN, '/mail/seen/…'),
    remoteAddress: req.ip,
  };
}
