/**
 * A visitor's report from a page (M16 B6, the DSA's notice and action): the form at the end of a
 * person's or an organization's page, an item or a collection, answered with a redirect back to
 * that page (`?reported=1` or `?report-error=<reason>`, at `#report`), so the page says what
 * happened and a refresh repeats nothing. In its own plugin, as the other visitor forms: a form
 * is anonymous here (no session read or made), and the limits bound what one source may send.
 */
import { INTERFACE_LANGUAGES } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { visitorReportReceiptMail } from '../lib/email';
import { AppError, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import {
  checkVisitorReport,
  REPORT_DETAILS_MAX,
  takeVisitorReport,
  type VisitorReportRefusal,
  visitorReportTarget,
} from '../lib/visitor-reports';

/** Reports a source may send in an hour, and an address in a day. */
export const REPORTS_AN_HOUR = 5;
export const REPORTS_A_DAY = 3;

const ReportForm = z.object({
  kind: z.string().max(16),
  handle: z.string().max(64),
  slug: z.string().max(80).default(''),
  reason: z.string().max(32).default('other'),
  // A browser sends a line break as two characters: room for that, the words counted after.
  details: z
    .string()
    .max(REPORT_DETAILS_MAX * 2)
    .default(''),
  name: z.string().max(200).default(''),
  email: z.string().max(400).default(''),
  statement: z.string().optional(),
  lang: z.string().max(8).optional(),
});

export async function publicReportRoutes(app: FastifyInstance, ctx: AppContext) {
  const back = (
    reply: FastifyReply,
    page: string,
    state: Record<string, string>,
    lang: string | undefined,
  ) => {
    const q = new URLSearchParams(state);
    if (lang && (INTERFACE_LANGUAGES as readonly string[]).includes(lang)) q.set('lang', lang);
    return reply.redirect(`${page}?${q.toString()}#report`, 303);
  };

  await app.register(async (forms) => {
    forms.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 16_384 },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    forms.post('/public/report', async (req, reply) => {
      const form = parse(ReportForm, req.body);
      const found = await visitorReportTarget(ctx, form);
      if (!found) throw notFound(tr('That page'));
      const refused = (reason: VisitorReportRefusal) =>
        back(reply, found.page, { report: '', 'report-error': reason }, form.lang);
      const checked = checkVisitorReport({
        reason: form.reason,
        details: form.details,
        name: form.name,
        email: form.email,
        statement: form.statement === 'on',
      });
      if (!checked.ok) return refused(checked.refusal);
      try {
        ctx.limiter.hit(
          `public-report:ip:${req.ip}`,
          ctx.config.isTest ? 1000 : REPORTS_AN_HOUR,
          3_600_000,
        );
        if (checked.email)
          ctx.limiter.hit(
            `public-report:email:${checked.email}`,
            ctx.config.isTest ? 1000 : REPORTS_A_DAY,
            86_400_000,
          );
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') return refused('too_many');
        throw err;
      }
      await takeVisitorReport(ctx, found.target, found.page, checked);
      const mail = ctx.mail;
      if (checked.email && mail) {
        const to = checked.email;
        const url = `${ctx.config.PUBLIC_URL}${found.page}`;
        ctx.defer('email.report', () => mail.send(visitorReportReceiptMail(to, checked.name, url)));
      }
      return back(reply, found.page, { reported: '1' }, form.lang);
    });
  });
}
