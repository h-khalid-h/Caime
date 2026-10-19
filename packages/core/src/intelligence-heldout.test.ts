import { describe, expect, it } from 'vitest';
import {
  HELD_OUT_ARABIC,
  type HeldOutLine,
  type HeldOutVariety,
} from './fixtures/intelligence-heldout';
import { analyzeMessage, suggestFromAnalysis } from './intelligence';

/**
 * Arabic as four places write it, held out from the rules (M16 G10): the lines were written
 * before the rules were measured on them, and no rule is fixed against one (a fix brings its own
 * lines to the golden set). The floors are what the rules read here once they'd been fixed
 * against the golden set alone, on 2026-10-19; before that day's fixes they read, in recall,
 * Cairo's promises 0.57, the Gulf's 0.57, the Levant's 0.29 and the Maghreb's 0.00, and the due
 * date right 0.57, 0.43, 0.43 and 0.14. A floor only ever moves up, and the output names each
 * line read wrong.
 */
const LABELS = ['question', 'request', 'commitment', 'decision'] as const;
type Label = (typeof LABELS)[number];
type Floor = { precision: number; recall: number };

const FLOORS: Record<HeldOutVariety, Record<Label, Floor>> = {
  egyptian: {
    question: { precision: 1, recall: 0.85 },
    request: { precision: 1, recall: 0.85 },
    commitment: { precision: 0.87, recall: 1 },
    decision: { precision: 1, recall: 1 },
  },
  gulf: {
    question: { precision: 1, recall: 1 },
    request: { precision: 1, recall: 1 },
    commitment: { precision: 0.87, recall: 1 },
    decision: { precision: 1, recall: 0.83 },
  },
  levantine: {
    question: { precision: 0.87, recall: 0.87 },
    request: { precision: 1, recall: 0.85 },
    commitment: { precision: 0.87, recall: 1 },
    decision: { precision: 1, recall: 0.66 },
  },
  maghrebi: {
    question: { precision: 1, recall: 1 },
    request: { precision: 1, recall: 1 },
    commitment: { precision: 0.85, recall: 0.85 },
    decision: { precision: 1, recall: 0.83 },
  },
};
const DUE_FLOORS: Record<HeldOutVariety, number> = {
  egyptian: 1,
  gulf: 1,
  levantine: 1,
  maghrebi: 1,
};
const VARIETIES = Object.keys(FLOORS) as HeldOutVariety[];

const NOW = new Date('2026-10-05T14:00:00Z');
const CLOCKS: Record<HeldOutVariety, { timeZone: string; locale: string }> = {
  egyptian: { timeZone: 'Africa/Cairo', locale: 'ar-EG' },
  gulf: { timeZone: 'Asia/Riyadh', locale: 'ar-SA' },
  levantine: { timeZone: 'Asia/Beirut', locale: 'ar-LB' },
  maghrebi: { timeZone: 'Africa/Casablanca', locale: 'ar-MA' },
};

function read(line: HeldOutLine) {
  const clock = CLOCKS[line.variety];
  const a = analyzeMessage(line.text, { now: NOW, ...clock });
  const got: Record<Label, boolean> = {
    question: a.isQuestion,
    request: a.isRequest,
    commitment: a.isCommitment,
    decision: a.isDecision,
  };
  const [first] = suggestFromAnalysis(a, { senderIsMe: false, senderName: 'Sam' });
  const due = first?.dueAt
    ? new Intl.DateTimeFormat('en-CA', { timeZone: clock.timeZone }).format(new Date(first.dueAt))
    : null;
  return { got, due };
}

describe('the held-out Arabic set', () => {
  for (const variety of VARIETIES) {
    const lines = HELD_OUT_ARABIC.filter((l) => l.variety === variety);
    for (const label of LABELS) {
      it(`${variety}: ${label} reads at or above its floor`, () => {
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
        const report = `${variety} ${label}: precision ${precision.toFixed(2)} recall ${recall.toFixed(2)}\n${wrong.join('\n')}`;
        expect(precision, report).toBeGreaterThanOrEqual(FLOORS[variety][label].precision);
        expect(recall, report).toBeGreaterThanOrEqual(FLOORS[variety][label].recall);
      });
    }

    it(`${variety}: due dates land on the day written`, () => {
      const dated = lines.filter((l) => l.due !== undefined);
      const wrong = dated
        .map((l) => ({ l, due: read(l).due }))
        .filter(({ l, due }) => due !== l.due)
        .map(({ l, due }) => `  ${l.text} → ${due} (wanted ${l.due})`);
      const share = 1 - wrong.length / dated.length;
      expect(share, `${variety}: ${share.toFixed(2)}\n${wrong.join('\n')}`).toBeGreaterThanOrEqual(
        DUE_FLOORS[variety],
      );
    });
  }

  it('holds each variety to the same shape: a third negatives, six of each label, seven dates', () => {
    for (const variety of VARIETIES) {
      const lines = HELD_OUT_ARABIC.filter((l) => l.variety === variety);
      const negatives = lines.filter((l) => !LABELS.some((k) => l.expect[k]));
      expect(negatives.length / lines.length, variety).toBeGreaterThanOrEqual(1 / 3);
      for (const label of LABELS)
        expect(
          lines.filter((l) => l.expect[label]).length,
          `${variety} ${label}`,
        ).toBeGreaterThanOrEqual(6);
      expect(lines.filter((l) => l.due).length, `${variety} dated`).toBeGreaterThanOrEqual(7);
    }
  });
});
