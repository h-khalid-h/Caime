import { describe, expect, it } from 'vitest';
import {
  applyChecklistOp,
  type ChecklistItem,
  checklistItems,
  checklistState,
  prepareKitFields,
} from './kit-cards';
import { kitsFor } from './kits';
import { LocationPayload } from './schemas';

const noor = { userId: 'noor', isCreator: true };
const sam = { userId: 'sam', isCreator: false };

function made(lines: string[]): ChecklistItem[] {
  const prepared = prepareKitFields('checklist', { title: 'Groceries', items: lines });
  if (!prepared.ok) throw new Error(prepared.error);
  return checklistItems(prepared.fields);
}

function apply(items: ChecklistItem[], op: Parameters<typeof applyChecklistOp>[1], who = sam) {
  const r = applyChecklistOp(items, op, who);
  if (!r.ok) throw new Error(r.error);
  return r.items;
}

describe('checklists', () => {
  it('starts from its lines, and is done only once everything is ticked', () => {
    const items = made(['Milk', '  ', ' Bread ']);
    expect(items).toEqual([
      { id: 'i1', text: 'Milk', done: false, doneBy: null, addedBy: null },
      { id: 'i2', text: 'Bread', done: false, doneBy: null, addedBy: null },
    ]);
    expect(checklistState(items)).toBe('open');
    const one = apply(items, { op: 'toggle', itemId: 'i1', done: true });
    expect(one[0]).toMatchObject({ done: true, doneBy: 'sam' });
    expect(checklistState(one)).toBe('open');
    const both = apply(one, { op: 'toggle', itemId: 'i2', done: true });
    expect(checklistState(both)).toBe('done');
    // Adding something opens it again; an empty list isn't done.
    expect(checklistState(apply(both, { op: 'add', text: 'Eggs' }))).toBe('open');
    expect(checklistState([])).toBe('open');
    expect(prepareKitFields('checklist', { title: 'Later' })).toMatchObject({ ok: true });
  });

  it('lets anyone add and tick, and only whoever added an item, or made the list, change it', () => {
    let items = made(['Milk']);
    items = apply(items, { op: 'add', text: 'Coffee' });
    expect(items[1]).toEqual({
      id: 'i2',
      text: 'Coffee',
      done: false,
      doneBy: null,
      addedBy: 'sam',
    });
    // Sam made neither the list nor Milk.
    expect(applyChecklistOp(items, { op: 'remove', itemId: 'i1' }, sam)).toEqual({
      ok: false,
      error: 'Only whoever added it, or made the list, can change it.',
      forbidden: true,
    });
    items = apply(items, { op: 'edit', itemId: 'i2', text: 'Decaf coffee' });
    expect(items[1]?.text).toBe('Decaf coffee');
    items = apply(items, { op: 'remove', itemId: 'i1' }, noor);
    // Ids aren't reused, so nothing ticked later lands on the wrong line.
    items = apply(items, { op: 'add', text: 'Tea' });
    expect(items.map((i) => i.id)).toEqual(['i2', 'i3']);
    expect(applyChecklistOp(items, { op: 'toggle', itemId: 'i1', done: true }, sam)).toMatchObject({
      ok: false,
    });
    expect(applyChecklistOp(items, { op: 'add', text: '   ' }, sam)).toMatchObject({ ok: false });
  });

  it('reads the same when checked twice, as the app and then the server do', () => {
    const once = prepareKitFields('checklist', { title: 'Groceries', items: ['Milk', 'Bread'] });
    if (!once.ok) throw new Error(once.error);
    expect(prepareKitFields('checklist', once.fields)).toEqual(once);
  });

  it('holds a hundred items of up to 200 characters', () => {
    const full = made(Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`));
    expect(applyChecklistOp(full, { op: 'add', text: 'One more' }, sam)).toEqual({
      ok: false,
      error: 'A list holds 100 items.',
    });
    expect(prepareKitFields('checklist', { title: 'x', items: ['a'.repeat(201)] })).toMatchObject({
      ok: false,
    });
  });
});

describe('locations (R29)', () => {
  it('are a place by name or where someone is, never half of one', () => {
    expect(LocationPayload.safeParse({ lat: 30.04, lng: 31.23, accuracy: 12 }).success).toBe(true);
    expect(LocationPayload.safeParse({ label: 'Café Riche, Downtown' }).success).toBe(true);
    expect(LocationPayload.safeParse({ lat: 30.04 }).success).toBe(false);
    expect(LocationPayload.safeParse({}).success).toBe(false);
    // One moment, shared on purpose: there's no live location.
    expect(LocationPayload.safeParse({ lat: 1, lng: 2, live: true }).success).toBe(false);
  });

  it('are never offered to anyone under 18', () => {
    const offered = (viewerIsMinor: boolean) =>
      kitsFor({ spheres: ['family'], isGroup: false, viewerIsMinor }).map((k) => k.id);
    expect(offered(false)).toContain('location');
    expect(offered(true)).not.toContain('location');
    expect(offered(true)).toContain('checklist');
  });
});
