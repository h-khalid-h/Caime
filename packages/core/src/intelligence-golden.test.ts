import { describe, expect, it } from 'vitest';
import { type GoldenLine, INTELLIGENCE_GOLDEN } from './fixtures/intelligence-golden';
import { analyzeMessage, suggestFromAnalysis } from './intelligence';

/**
 * Precision and recall of the rules over the golden set, per label and per language. The floors
 * only ever move up: a change that drops one below is a change that costs people a wrong card
 * (or a missed one), and the failing output names each line so the rule can be fixed.
 */
const LABELS = ['question', 'request', 'commitment', 'decision'] as const;
type Label = (typeof LABELS)[number];
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
type Floors = Record<Label, { precision: number; recall: number }>;

const FLOOR: Floors = {
  question: { precision: 0.85, recall: 0.85 },
  request: { precision: 0.9, recall: 0.8 },
  commitment: { precision: 0.9, recall: 0.8 },
  decision: { precision: 0.9, recall: 0.8 },
};
/** French and Turkish start where they were measured when they were added (2026-10-06). */
const MEASURED: Floors = {
  question: { precision: 1, recall: 1 },
  request: { precision: 1, recall: 1 },
  commitment: { precision: 1, recall: 1 },
  decision: { precision: 1, recall: 1 },
};
const FLOORS: Record<GoldenLine['lang'], Floors> = {
  en: FLOOR,
  ar: FLOOR,
  fr: MEASURED,
  tr: MEASURED,
};
const DUE_FLOOR = 0.85;

const NOW = new Date('2026-10-05T14:00:00Z');
const CLOCKS: Record<GoldenLine['lang'], { timeZone: string; locale: string }> = {
  en: { timeZone: 'America/New_York', locale: 'en-US' },
  ar: { timeZone: 'Africa/Cairo', locale: 'ar-EG' },
  fr: { timeZone: 'Europe/Paris', locale: 'fr-FR' },
  tr: { timeZone: 'Europe/Istanbul', locale: 'tr-TR' },
};
const optionsFor = (lang: GoldenLine['lang']) => ({ now: NOW, ...CLOCKS[lang] });

function read(line: GoldenLine) {
  const a = analyzeMessage(line.text, optionsFor(line.lang));
  const got = {
    question: a.isQuestion,
    request: a.isRequest,
    commitment: a.isCommitment,
    decision: a.isDecision,
  };
  const [first] = suggestFromAnalysis(a, { senderIsMe: false, senderName: 'Sam' });
  const due = first?.dueAt ? first.dueAt.slice(0, 10) : null;
  return { got, due };
}

function score(lines: GoldenLine[], label: Label) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const wrong: string[] = [];
  for (const line of lines) {
    const want = Boolean(line.expect[label]);
    const { got } = read(line);
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
  }

  it('due dates land on the day written', () => {
    const dated = INTELLIGENCE_GOLDEN.filter((l) => l.due !== undefined);
    const wrong: string[] = [];
    for (const line of dated) {
      const { due } = read(line);
      if (due !== line.due) wrong.push(`  ${line.text} → ${due} (wanted ${line.due})`);
    }
    const share = 1 - wrong.length / dated.length;
    expect(
      share,
      `due dates right: ${share.toFixed(2)}\n${wrong.join('\n')}`,
    ).toBeGreaterThanOrEqual(DUE_FLOOR);
  });

  it('holds a balanced set: at least a third negatives, in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = INTELLIGENCE_GOLDEN.filter((l) => l.lang === lang);
      const negatives = lines.filter((l) => !LABELS.some((k) => l.expect[k]));
      expect(negatives.length / lines.length).toBeGreaterThanOrEqual(1 / 3);
      expect(lines.length).toBeGreaterThanOrEqual(40);
    }
  });
});
