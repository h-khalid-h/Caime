import { describe, expect, it } from 'vitest';
import {
  CUSTOM_KIT_LIMITS,
  type CustomKitCard,
  customDetails,
  customMoves,
  customState,
  customTitle,
  isCustomCard,
  mergeCustomFields,
  parseCustomKit,
  prepareCustomFields,
} from './custom-kits';
import { messagePreview } from './format';
import { KITS } from './kits';

/** A pharmacy's prescription card: prepared, then ready, then collected (or cancelled). */
const prescription = {
  name: 'Prescription',
  description: 'A prescription, and when it’s ready',
  icon: 'clipboard-list',
  fields: [
    { key: 'medicine', label: 'Medicine', type: 'text', required: true },
    { key: 'notes', label: 'Notes', type: 'longtext' },
    { key: 'readyBy', label: 'Ready by', type: 'datetime' },
    {
      key: 'branch',
      label: 'Branch',
      type: 'options',
      choices: [
        { value: 'zamalek', label: 'Zamalek' },
        { value: 'maadi', label: 'Maadi' },
      ],
    },
  ],
  states: [
    { id: 'preparing', label: 'Being prepared' },
    { id: 'ready', label: 'Ready to collect', tone: 'positive' },
    { id: 'collected', label: 'Collected', tone: 'positive' },
    { id: 'cancelled', label: 'Cancelled', tone: 'negative' },
  ],
  moves: [
    { from: 'preparing', to: 'ready', label: 'Mark ready', who: 'organization' },
    { from: 'ready', to: 'collected', label: 'I collected it', who: 'customer' },
    { from: 'preparing', to: 'cancelled', label: 'Cancel', who: 'anyone' },
  ],
};

const parsed = (key: string, input: unknown) => {
  const r = parseCustomKit(key, input);
  if (!r.ok) throw new Error(r.error);
  return r.def;
};

const refusal = (key: string, input: unknown) => {
  const r = parseCustomKit(key, input);
  return r.ok ? null : r.error;
};

const change = (patch: Record<string, unknown>) => ({ ...prescription, ...patch });

describe('an app’s own kit', () => {
  it('is read as it was described, starting in its first state', () => {
    const def = parsed('prescription', prescription);
    expect(def).toMatchObject({
      key: 'prescription',
      name: 'Prescription',
      icon: 'clipboard-list',
      adultsOnly: false,
    });
    expect(def.fields.map((f) => f.key)).toEqual(['medicine', 'notes', 'readyBy', 'branch']);
    expect(def.states[0]).toEqual({ id: 'preparing', label: 'Being prepared', tone: 'neutral' });
    expect(def.moves).toHaveLength(3);
  });

  it('is kept as plain data: what it doesn’t know, it refuses', () => {
    expect(refusal('prescription', change({ render: '<b>x</b>' }))).toBe(
      'The kit has no “render”.',
    );
    expect(refusal('prescription', change({ key: 'other' }))).toMatch(/key is the one/);
    expect(
      refusal(
        'prescription',
        change({ fields: [{ key: 'm', label: 'M', type: 'text', choices: [] }] }),
      ),
    ).toMatch(/only options have choices/);
  });

  it('has a key, fields, states and moves that fit together', () => {
    expect(refusal('Rx', prescription)).toMatch(/lowercase/);
    expect(refusal('x', prescription)).toMatch(/2 to 40/);
    expect(refusal('prescription', change({ fields: [] }))).toMatch(/Fields: 1 to 12/);
    expect(
      refusal(
        'prescription',
        change({
          fields: Array.from({ length: CUSTOM_KIT_LIMITS.fields + 1 }, (_, i) => ({
            key: `f${i}`,
            label: `F${i}`,
            type: 'text',
          })),
        }),
      ),
    ).toMatch(/Fields: 1 to 12/);
    expect(
      refusal(
        'prescription',
        change({
          fields: [
            { key: 'a', label: 'A', type: 'text' },
            { key: 'a', label: 'B', type: 'text' },
          ],
        }),
      ),
    ).toMatch(/key of its own/);
    expect(
      refusal('prescription', change({ fields: [{ key: 'a', label: 'A', type: 'people' }] })),
    ).toMatch(/its type is one of/);
    expect(
      refusal(
        'prescription',
        change({
          fields: [
            { key: 'a', label: 'A', type: 'options', choices: [{ value: 'x', label: 'X' }] },
          ],
        }),
      ),
    ).toMatch(/choices: 2 to 12/);
    expect(
      refusal(
        'prescription',
        change({
          states: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        }),
      ),
    ).toMatch(/id of its own/);
    expect(
      refusal(
        'prescription',
        change({ moves: [{ from: 'preparing', to: 'gone', label: 'Go', who: 'anyone' }] }),
      ),
    ).toMatch(/to another of the kit’s states/);
    expect(
      refusal(
        'prescription',
        change({ moves: [{ from: 'ready', to: 'ready', label: 'Again', who: 'anyone' }] }),
      ),
    ).toMatch(/to another of the kit’s states/);
    expect(
      refusal(
        'prescription',
        change({
          moves: [
            { from: 'preparing', to: 'ready', label: 'Ready', who: 'anyone' },
            { from: 'preparing', to: 'ready', label: 'Ready!', who: 'customer' },
          ],
        }),
      ),
    ).toMatch(/there already/);
    expect(
      refusal(
        'prescription',
        change({ moves: [{ from: 'preparing', to: 'ready', label: 'Ready', who: 'the bot' }] }),
      ),
    ).toMatch(/organization, customer or anyone/);
    expect(refusal('prescription', change({ icon: 'skull' }))).toMatch(/icon is one of/);
    // Each reads as itself: two fields, two states, or two buttons on one state never read alike.
    expect(
      refusal(
        'prescription',
        change({
          fields: [
            { key: 'a', label: 'Medicine', type: 'text' },
            { key: 'b', label: 'medicine', type: 'text' },
          ],
        }),
      ),
    ).toMatch(/label of its own/);
    expect(
      refusal(
        'prescription',
        change({
          states: [
            { id: 'a', label: 'Ready' },
            { id: 'b', label: 'Ready' },
          ],
          moves: [],
        }),
      ),
    ).toMatch(/label of its own/);
    expect(
      refusal(
        'prescription',
        change({
          moves: [
            { from: 'preparing', to: 'ready', label: 'Next', who: 'organization' },
            { from: 'preparing', to: 'cancelled', label: 'Next', who: 'anyone' },
          ],
        }),
      ),
    ).toMatch(/From preparing, each move has a label of its own/);
    expect(
      refusal(
        'prescription',
        change({
          fields: [
            {
              key: 'size',
              label: 'Size',
              type: 'options',
              choices: [
                { value: 'm', label: 'Medium' },
                { value: 'm', label: 'Also medium' },
              ],
            },
          ],
        }),
      ),
    ).toMatch(/each choice once/);
    expect(
      refusal('prescription', change({ states: [{ id: 'ready', label: 'Ready', tone: 'loud' }] })),
    ).toMatch(/tone is positive, negative or neutral/);
  });

  it('says only plain text: nothing that hides or reorders what a label says', () => {
    for (const label of [
      'Mark\u202eydaer',
      'Ready\u2066',
      'Bell\u0007',
      'Two\nlines',
      'Pick up \u061c9-11',
      'Two\u2028lines',
      'Two\u2029paragraphs',
    ])
      expect(
        refusal(
          'prescription',
          change({ moves: [{ from: 'preparing', to: 'ready', label, who: 'organization' }] }),
        ),
        JSON.stringify(label),
      ).toMatch(/plain text only/);
    // Arabic reads as it's written, with no marks needed; Persian keeps its joiners, and emoji
    // theirs.
    expect(parsed('prescription', change({ name: 'وصفة طبية' })).name).toBe('وصفة طبية');
    expect(parsed('prescription', change({ name: 'نسخه\u200cها' })).name).toBe('نسخه\u200cها');
    expect(parsed('prescription', change({ name: 'Family \u{1F468}\u200d\u{1F467}' })).name).toBe(
      'Family \u{1F468}\u200d\u{1F467}',
    );
    // Nothing to see is no label.
    for (const name of ['\u200b', '\u2060\u2060', '\u3164'])
      expect(refusal('prescription', change({ name })), JSON.stringify(name)).toMatch(
        /write it as text/,
      );
    expect(refusal('prescription', change({ name: 'x'.repeat(41) }))).toMatch(/under 40/);
  });

  it('is never in a conversation with anyone under 18 when it’s about money', () => {
    expect(parsed('prescription', prescription).adultsOnly).toBe(false);
    expect(parsed('prescription', change({ adultsOnly: true })).adultsOnly).toBe(true);
    const priced = change({
      fields: [...prescription.fields, { key: 'price', label: 'Price', type: 'amount' }],
      adultsOnly: false,
    });
    expect(parsed('prescription', priced).adultsOnly).toBe(true);
    // The same rule as Caime's own cards: every one with an amount is for adults only.
    for (const kit of Object.values(KITS))
      if (kit.fields.some((f) => f.type === 'amount')) expect(kit.adultsOnly, kit.id).toBe(true);
  });
});

describe('a card of an app’s kit', () => {
  const def = parsed('prescription', prescription);
  const card = (state: string, fields: Record<string, unknown>): CustomKitCard => ({
    kit: 'custom',
    app: { id: 'app-1', name: 'Nile Pharmacy' },
    key: def.key,
    label: def.name,
    icon: def.icon,
    title: customTitle(def, fields),
    fields,
    state,
    history: [],
    def: { fields: def.fields, states: def.states, moves: def.moves, adultsOnly: def.adultsOnly },
  });

  it('holds only what its kit has, checked as Caime’s own cards are', () => {
    expect(prepareCustomFields(def, { medicine: '  Amoxicillin ', extra: 'x' })).toEqual({
      ok: true,
      fields: { medicine: 'Amoxicillin' },
    });
    expect(prepareCustomFields(def, { notes: 'Twice a day' })).toEqual({
      ok: false,
      error: 'Medicine is needed.',
    });
    expect(prepareCustomFields(def, { medicine: 'A', branch: 'giza' })).toEqual({
      ok: false,
      error: 'Branch: pick one of the choices.',
    });
  });

  it('changes only what an app changes, and loses only what it takes away', () => {
    const now = { medicine: 'Amoxicillin', notes: 'Twice a day', branch: 'maadi' };
    expect(mergeCustomFields(def, now, { notes: null, branch: 'zamalek' })).toEqual({
      ok: true,
      fields: { medicine: 'Amoxicillin', branch: 'zamalek' },
    });
    expect(mergeCustomFields(def, now, { medicine: null })).toEqual({
      ok: false,
      error: 'Medicine is needed.',
    });
    expect(mergeCustomFields(def, now, { dosage: '2' })).toEqual({
      ok: false,
      error: 'The card has no “dosage”.',
    });
    expect(mergeCustomFields(def, now, ['notes'])).toMatchObject({ ok: false });
  });

  it('reads like Caime’s own cards: its main line, its details, where it stands', () => {
    const c = card('preparing', {
      medicine: 'Amoxicillin',
      readyBy: { at: '2026-10-02T13:00:00.000Z', hasTime: true },
      branch: 'maadi',
    });
    expect(isCustomCard(c)).toBe(true);
    expect(c.title).toBe('Amoxicillin');
    expect(
      customDetails(c, {
        now: new Date('2026-10-01T09:00:00Z'),
        timeZone: 'Africa/Cairo',
        locale: 'en',
      }),
    ).toEqual([
      { key: 'readyBy', label: 'Ready by', value: expect.stringMatching(/4:00\s?PM/) },
      { key: 'branch', label: 'Branch', value: 'Maadi' },
    ]);
    expect(customState(c)).toEqual({ id: 'preparing', label: 'Being prepared', tone: 'neutral' });
    expect(customState({ ...c, state: 'lost_in_post' }).label).toBe('Lost in post');
    expect(messagePreview({ kind: 'kit', body: null, payload: c } as never)).toBe(
      'Prescription: Amoxicillin',
    );
    // Another year says which.
    const later = card('preparing', {
      medicine: 'A',
      readyBy: { at: '2027-03-12T13:00:00.000Z', hasTime: false },
    });
    expect(
      customDetails(later, {
        now: new Date('2026-10-01T09:00:00Z'),
        timeZone: 'Africa/Cairo',
        locale: 'en',
      })[0]?.value,
    ).toMatch(/2027/);
    // Without its main text, a card is called by its kit.
    expect(customTitle(def, {})).toBe('Prescription');
    // Its main line is its first required text, wherever it is; else the first text it has.
    const coded = parsed('coded', {
      ...prescription,
      fields: [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'medicine', label: 'Medicine', type: 'text', required: true },
      ],
    });
    expect(customTitle(coded, { code: 'RX-12', medicine: 'Amoxicillin' })).toBe('Amoxicillin');
    expect(customTitle(coded, { code: 'RX-12' })).toBe('RX-12');
  });

  it('offers each side only its own moves, from where the card stands', () => {
    const preparing = card('preparing', { medicine: 'A' });
    expect(customMoves(preparing, true).map((m) => m.to)).toEqual(['ready', 'cancelled']);
    expect(customMoves(preparing, false).map((m) => m.to)).toEqual(['cancelled']);
    const ready = card('ready', { medicine: 'A' });
    expect(customMoves(ready, true)).toEqual([]);
    expect(customMoves(ready, false).map((m) => m.label)).toEqual(['I collected it']);
    expect(customMoves(card('collected', { medicine: 'A' }), false)).toEqual([]);
  });

  it('is told apart from Caime’s own cards and anything else', () => {
    expect(isCustomCard({ kit: 'order_status', state: 'placed' })).toBe(false);
    expect(isCustomCard({ kit: 'custom', key: 'x', state: 'a', app: { id: 'a' } })).toBe(false);
    expect(isCustomCard(null)).toBe(false);
  });
});
