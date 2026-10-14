/**
 * The draft data processing agreement (docs/DPA-DRAFT.md, R54) states facts about the product;
 * this keeps them the code's: every sub-processor in core's one list is named in it with what
 * it receives, and the retention spans and limits it cites are the ones in force.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDGE, HOSTING, SUB_PROCESSORS } from '@caime/core/processors';
import { describe, expect, it } from 'vitest';
import { KEPT_DAYS } from '../src/lib/retention';

const doc = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'DPA-DRAFT.md'), 'utf8');

describe('the draft data processing agreement', () => {
  it('says what it is, decides every point, and names every sub-processor the code has', () => {
    expect(doc).toContain('not yet signed by anyone, not published.');
    // Counsel decided every point once marked for the lawyer (LEGAL-REVIEW, 2026-10-14).
    expect(doc).not.toContain('[lawyer]');
    expect(doc).not.toContain('[owner]');
    for (const p of SUB_PROCESSORS) expect(doc, p.id).toContain(p.name);
    expect(doc).toContain(HOSTING.does);
    expect(doc).toContain(HOSTING.receives);
    // The network in front of the servers, named by the operator as the host is.
    expect(EDGE.id).toBe('edge');
    expect(doc).toContain('`EDGE_PROVIDER`');
  });

  it('cites the retention spans and limits in force', () => {
    expect(KEPT_DAYS.endedSignIns).toBe(30);
    expect(doc).toContain('ended sign-ins are kept 30 days');
    expect(KEPT_DAYS.securityRecords).toBe(365);
    expect(KEPT_DAYS.heldHandles).toBe(365);
    expect(doc).toContain('security records a year');
    // The API's own bounds for an organization's retention (schemas.ts).
    expect(doc).toContain('from 1 to\n  3,650 days');
    // The export's rate limit (modules/orgs.ts), and how passwords are kept (lib/crypto.ts).
    expect(doc).toContain('three times an hour');
    expect(doc).toContain('passwords hashed (scrypt)');
  });

  it('says how an organization’s closing ends processing, as the code does it (section 12)', () => {
    // lib/org-data.ts: the export window, then `clearClosedOrg` by the daily sweep.
    expect(KEPT_DAYS.closedOrgExport).toBe(30);
    expect(doc).toContain('available to its last owner for 30 days after closing');
    expect(doc).toContain('After those\n30 days the Operator deletes');
    expect(doc).not.toContain('⛔ Engineering');
    expect(doc).not.toContain("Operator's proposal");
  });
});
