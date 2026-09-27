/**
 * What a request says of itself in the server's log: its method, its path and who asked. Never
 * its query string (search terms, handles), and never a secret that's part of its path: a
 * calendar feed's address is what lets a calendar read it, so it's masked.
 */
const CALENDAR_FEED = /\/calendar\/cal_[^/]*$/;

export function requestForLog(req: { method: string; url: string; ip?: string }) {
  return {
    method: req.method,
    url: req.url.split('?')[0]?.replace(CALENDAR_FEED, '/calendar/cal_….ics'),
    remoteAddress: req.ip,
  };
}
