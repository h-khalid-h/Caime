import { describe, expect, it } from 'vitest';
import { type GoldenLine, INTELLIGENCE_GOLDEN } from './fixtures/intelligence-golden';
import { HELD_OUT_ARABIC } from './fixtures/intelligence-heldout';
import { analyzeMessage, suggestFromAnalysis } from './intelligence';
import { surenessOf } from './sureness';

/**
 * Precision and recall of the rules over the golden set, per label and per language, and the due
 * date right per language (M16 G10: a pooled floor let a language with few dated lines be wrong
 * on every one). The floors only ever move up: a change that drops one below is a change that
 * costs people a wrong card (or a missed one), and the failing output names each line so the
 * rule can be fixed.
 */
const LABELS = ['question', 'request', 'commitment', 'decision'] as const;
type Label = (typeof LABELS)[number];
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
type Floors = Record<Label, { precision: number; recall: number }>;

/** Every label in every language read whole when measured (2026-10-19, M16 G10). */
const MEASURED: Floors = {
  question: { precision: 1, recall: 1 },
  request: { precision: 1, recall: 1 },
  commitment: { precision: 1, recall: 1 },
  decision: { precision: 1, recall: 1 },
};
const FLOORS: Record<GoldenLine['lang'], Floors> = {
  en: MEASURED,
  ar: MEASURED,
  fr: MEASURED,
  tr: MEASURED,
};
const DUE_FLOORS: Record<GoldenLine['lang'], number> = { en: 1, ar: 1, fr: 1, tr: 1 };
/** What each language holds at least, so no floor stands on a handful of lines. */
const POSITIVES_EACH = 15;
const DATED_EACH = 15;

const NOW = new Date('2026-10-05T14:00:00Z');
const CLOCKS: Record<GoldenLine['lang'], { timeZone: string; locale: string }> = {
  en: { timeZone: 'America/New_York', locale: 'en-US' },
  ar: { timeZone: 'Africa/Cairo', locale: 'ar-EG' },
  fr: { timeZone: 'Europe/Paris', locale: 'fr-FR' },
  tr: { timeZone: 'Europe/Istanbul', locale: 'tr-TR' },
};

/** The day an instant falls on, on the writer's clock: "tonight" in New York is today there. */
const dayIn = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

function read(text: string, clock: { timeZone: string; locale: string }, card?: string) {
  const a = analyzeMessage(text, { now: NOW, ...clock, card });
  const got = {
    question: a.isQuestion,
    request: a.isRequest,
    commitment: a.isCommitment,
    decision: a.isDecision,
  };
  const suggestions = suggestFromAnalysis(a, { senderIsMe: false, senderName: 'Sam' });
  const first = suggestions[0];
  const due = first?.dueAt ? dayIn(first.dueAt, clock.timeZone) : null;
  return { got, due, suggestions };
}
const readLine = (line: GoldenLine) => read(line.text, CLOCKS[line.lang], line.card);

function score(lines: GoldenLine[], label: Label) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const wrong: string[] = [];
  for (const line of lines) {
    const want = Boolean(line.expect[label]);
    const { got } = readLine(line);
    if (got[label] && want) tp += 1;
    else if (got[label]) {
      fp += 1;
      wrong.push(`  false ${label}: ${line.text}`);
    } else if (want) {
      fn += 1;
      wrong.push(`  missed ${label}: ${line.text}`);
    }
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall, tp, fp, fn, wrong };
}

describe('the golden set', () => {
  for (const lang of LANGUAGES) {
    const lines = INTELLIGENCE_GOLDEN.filter((l) => l.lang === lang);
    for (const label of LABELS) {
      it(`${lang}: ${label} reads at or above its floor`, () => {
        const s = score(lines, label);
        const report = `${lang} ${label}: precision ${s.precision.toFixed(2)} recall ${s.recall.toFixed(2)} (tp ${s.tp}, fp ${s.fp}, fn ${s.fn})\n${s.wrong.join('\n')}`;
        expect(s.precision, report).toBeGreaterThanOrEqual(FLOORS[lang][label].precision);
        expect(s.recall, report).toBeGreaterThanOrEqual(FLOORS[lang][label].recall);
      });
    }

    it(`${lang}: due dates land on the day written, on the writer's clock`, () => {
      const dated = lines.filter((l) => l.due !== undefined);
      const wrong: string[] = [];
      for (const line of dated) {
        const { due } = readLine(line);
        if (due !== line.due) wrong.push(`  ${line.text} → ${due} (wanted ${line.due})`);
      }
      const share = 1 - wrong.length / dated.length;
      expect(
        share,
        `${lang} due dates right: ${share.toFixed(2)}\n${wrong.join('\n')}`,
      ).toBeGreaterThanOrEqual(DUE_FLOORS[lang]);
    });
  }

  it('holds a balanced set: a third negatives, 15 of each label and 15 dates, in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = INTELLIGENCE_GOLDEN.filter((l) => l.lang === lang);
      const negatives = lines.filter((l) => !LABELS.some((k) => l.expect[k]));
      expect(negatives.length / lines.length, lang).toBeGreaterThanOrEqual(1 / 3);
      expect(lines.length, lang).toBeGreaterThanOrEqual(40);
      for (const label of LABELS)
        expect(
          lines.filter((l) => l.expect[label]).length,
          `${lang} ${label}`,
        ).toBeGreaterThanOrEqual(POSITIVES_EACH);
      expect(lines.filter((l) => l.due).length, `${lang} dated`).toBeGreaterThanOrEqual(DATED_EACH);
    }
  });
});

/**
 * "Quite sure" and "Fairly sure" (core `sureness.ts`) are claims: over every line of the golden
 * and held-out sets, a suggestion said "Quite sure" is right (its kind, and its day where the line
 * says one) at least nine times in ten, "Fairly sure" three in four, and never less than a guess
 * would be. Measured 2026-10-19: 124 of 124 and 181 of 185.
 */
describe('the words for sureness', () => {
  it('say how often a suggestion is right', () => {
    const lines = [
      ...INTELLIGENCE_GOLDEN.map((l) => ({ ...l, clock: CLOCKS[l.lang] })),
      ...HELD_OUT_ARABIC.map((l) => ({ ...l, clock: CLOCKS.ar })),
    ];
    const tally: Record<string, { right: number; all: number }> = {};
    for (const line of lines) {
      const { suggestions, due } = read(
        line.text,
        line.clock,
        'card' in line ? line.card : undefined,
      );
      suggestions.forEach((s, i) => {
        const kindRight =
          (s.kind === 'waiting' && line.expect.commitment) ||
          (s.kind === 'task' && line.expect.request) ||
          (s.kind === 'decision' && line.expect.decision);
        const dayRight = i > 0 || line.due === undefined || due === line.due;
        const bucket = surenessOf(s.confidence);
        tally[bucket] ??= { right: 0, all: 0 };
        tally[bucket].all += 1;
        if (kindRight && dayRight) tally[bucket].right += 1;
      });
    }
    const share = (b: string) => (tally[b] ? tally[b].right / tally[b].all : 1);
    const report = JSON.stringify(tally);
    expect(tally.sure?.all, report).toBeGreaterThan(50);
    expect(share('sure'), report).toBeGreaterThanOrEqual(0.9);
    expect(share('fairly'), report).toBeGreaterThanOrEqual(0.75);
    expect(share('sure'), report).toBeGreaterThanOrEqual(share('fairly'));
  });
});
