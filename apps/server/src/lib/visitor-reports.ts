/**
 * A visitor's report from a page (M16 B6, the DSA's notice and action, Art. 16): whoever reads a
 * person's or an organization's page, one of its items or collections, may say what's wrong with
 * it in a form at the page's end (`#report`, a `<details>` that opens on `?report`; no script).
 * It's a report like any other (`reports`, read on `/admin/reports`), with the visitor's name and
 * address in place of an account and the page it came from; a child's safety may be reported
 * without either (Art. 16(2)(c)). A receipt goes to the address after the response, and the
 * decision once the report is closed (`mailVisitorDecision`, from `settleReport`), in plain
 * English as all mail is. The name and the address are kept with the report and go with it.
 */
import type { ReportReason } from '@caime/core';
import { REPORT_REASONS, uuidv7 } from '@caime/core';
import type { AppContext } from '../context';

/** Why a visitor's report wasn't taken, as the page says it (`?report-error=`). */
export const VISITOR_REPORT_REFUSALS = ['too_many', 'contact', 'details', 'statement'] as const;
export type VisitorReportRefusal = (typeof VISITOR_REPORT_REFUSALS)[number];

/** The form's state on its page, from the page's query: opened, sent, or refused and why. */
export interface VisitorReportState {
  open: boolean;
  sent: boolean;
  error: VisitorReportRefusal | null;
}

export function visitorReportState(search: URLSearchParams): VisitorReportState {
  const raw = search.get('report-error');
  const error =
    raw && (VISITOR_REPORT_REFUSALS as readonly string[]).includes(raw)
      ? (raw as VisitorReportRefusal)
      : null;
  return {
    open: search.has('report') || error !== null,
    sent: search.get('reported') === '1',
    error,
  };
}

/** How long what's wrong may be, and how short. */
export const REPORT_DETAILS_MIN = 10;
export const REPORT_DETAILS_MAX = 2000;

export interface VisitorReportForm {
  reason: string;
  details: string;
  name: string;
  email: string;
  statement: boolean;
}

/** Whom the page is about: a person, or an organization (its items and collections are its). */
export type VisitorReportTarget =
  | { kind: 'person'; userId: string; handle: string }
  | { kind: 'org'; orgId: string; handle: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form checked: a reason, what's wrong, who's writing (unless a child's safety), in good faith. */
export function checkVisitorReport(
  form: VisitorReportForm,
):
  | { ok: true; reason: ReportReason; details: string; name: string | null; email: string | null }
  | { ok: false; refusal: VisitorReportRefusal } {
  const reason = (REPORT_REASONS as readonly string[]).includes(form.reason)
    ? (form.reason as ReportReason)
    : 'other';
  const details = form.details.replace(/\r\n/g, '\n').trim();
  if (details.length < REPORT_DETAILS_MIN || details.length > REPORT_DETAILS_MAX)
    return { ok: false, refusal: 'details' };
  const name = form.name.trim().slice(0, 80) || null;
  const email = form.email.trim().toLowerCase().slice(0, 254) || null;
  if (email && !EMAIL.test(email)) return { ok: false, refusal: 'contact' };
  if (reason !== 'child_safety' && (!name || !email)) return { ok: false, refusal: 'contact' };
  if (!form.statement) return { ok: false, refusal: 'statement' };
  return { ok: true, reason, details, name, email };
}

/** Kept as a report from nobody's account, with whom to tell; the receipt mailed after. */
export async function takeVisitorReport(
  ctx: AppContext,
  target: VisitorReportTarget,
  page: string,
  checked: { reason: ReportReason; details: string; name: string | null; email: string | null },
): Promise<string> {
  const id = uuidv7();
  await ctx.db
    .insertInto('reports')
    .values({
      id,
      reporter_id: null,
      target_user_id: target.kind === 'person' ? target.userId : null,
      org_id: target.kind === 'org' ? target.orgId : null,
      message_id: null,
      conversation_id: null,
      reason: checked.reason,
      details: checked.details,
      visitor_name: checked.name,
      visitor_email: checked.email,
      page,
    })
    .execute();
  ctx.metrics.reports.inc({ from: 'visitor', reason: checked.reason });
  return id;
}

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * Whom a page is about, from the form's own fields (never a path it names): a person on Caime or
 * an open organization by handle, and the page as `/@handle` or `/o/handle`, with an item's or a
 * collection's address after it. Null when there's no such page.
 */
export async function visitorReportTarget(
  ctx: AppContext,
  form: { kind: string; handle: string; slug: string },
): Promise<{ target: VisitorReportTarget; page: string } | null> {
  const handle = form.handle.trim().toLowerCase();
  const slug = form.slug.trim().toLowerCase();
  if (!HANDLE.test(handle) || (slug && !SLUG.test(slug))) return null;
  const after = slug ? `/${slug}` : '';
  if (form.kind === 'person') {
    const u = await ctx.db
      .selectFrom('users')
      .select('id')
      .where('handle', '=', handle)
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return u
      ? { target: { kind: 'person', userId: u.id, handle }, page: `/@${handle}${after}` }
      : null;
  }
  if (form.kind === 'org') {
    const o = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', handle)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    return o
      ? { target: { kind: 'org', orgId: o.id, handle }, page: `/o/${handle}${after}` }
      : null;
  }
  return null;
}
