import { describe, expect, it } from 'vitest';
import { describeRelationshipEvent } from './history';

const colleague = {
  sphere: 'work',
  role: 'colleague',
  roleLabel: null,
  orgName: 'DATA C',
  contextNote: null,
  shared: false,
  status: 'active',
};
const manager = { ...colleague, role: 'manager' };

describe('describeRelationshipEvent', () => {
  it('tells the story of a relationship in one line per change, by name', () => {
    const say = (kind: string, before: unknown, after: unknown) =>
      describeRelationshipEvent({ kind, before, after }, 'Sarah');
    expect(say('created', null, colleague)).toBe('Added “Colleague · DATA C”');
    expect(say('changed', colleague, manager)).toBe(
      '“Colleague · DATA C” became “Manager · DATA C”',
    );
    expect(say('changed', manager, { ...manager, contextNote: 'Met at the offsite' })).toBe(
      'Added a note to “Manager · DATA C”',
    );
    expect(say('shared', manager, { ...manager, shared: true })).toBe(
      'Shared “Manager · DATA C” with Sarah',
    );
    expect(say('unshared', { ...manager, shared: true }, manager)).toBe(
      'Stopped sharing “Manager · DATA C” with Sarah',
    );
    expect(say('ended', manager, { ...manager, status: 'ended' })).toBe('“Manager · DATA C” ended');
    expect(say('restored', { ...manager, status: 'ended' }, manager)).toBe(
      'Restored “Manager · DATA C”',
    );
    expect(say('merged', colleague, { into: 'x' })).toBe(
      'Merged “Colleague · DATA C” into another label',
    );
  });

  it('never throws on a malformed or unknown event', () => {
    expect(describeRelationshipEvent({ kind: 'created', before: null, after: 'x' }, 'Sam')).toBe(
      'Added a label',
    );
    expect(
      describeRelationshipEvent({ kind: 'changed', before: { sphere: 'nope' }, after: 7 }, 'Sam'),
    ).toBe('Updated a label');
    expect(
      describeRelationshipEvent({ kind: 'teleported', before: null, after: manager }, 'Sam'),
    ).toBe('Updated “Manager · DATA C”');
  });
});
