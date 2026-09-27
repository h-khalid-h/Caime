import { describe, expect, it } from 'vitest';
import { mentionAt, mentionCandidates, mentionedIn, mentionText } from './mentions';

const people = [
  { userId: 'al', displayName: 'Al', handle: 'al.b' },
  { userId: 'als', displayName: 'Al Smith', handle: 'smith' },
  { userId: 'jose', displayName: 'José Ruiz', handle: 'jose.r' },
  { userId: 'noor', displayName: 'Noor Haddad', handle: 'noor' },
];

describe('mentions (PRD §20)', () => {
  it('finds the name being typed just before the caret', () => {
    expect(mentionAt('Thanks @No', 10)).toEqual({ start: 7, query: 'No' });
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('Ask @Al Sm', 10)).toEqual({ start: 4, query: 'Al Sm' });
    // Only up to the caret: what follows it isn't part of the name.
    expect(mentionAt('Hi @Noor, see you', 6)).toEqual({ start: 3, query: 'No' });
  });

  it('isn’t a mention in an address, after a line, two spaces or a space first', () => {
    expect(mentionAt('mail sam@example', 16)).toBeNull();
    expect(mentionAt('@Noor\nand', 9)).toBeNull();
    expect(mentionAt('@Al  x', 6)).toBeNull();
    expect(mentionAt('@ Noor', 6)).toBeNull();
    expect(mentionAt('no at sign', 10)).toBeNull();
    expect(mentionAt(`@${'x'.repeat(41)}`, 42)).toBeNull();
  });

  it('offers who it could be: names first, then a word in a name, then handles', () => {
    expect(mentionCandidates('al', people).map((p) => p.userId)).toEqual(['al', 'als']);
    expect(mentionCandidates('smi', people).map((p) => p.userId)).toEqual(['als']);
    expect(mentionCandidates('jose', people).map((p) => p.userId)).toEqual(['jose']);
    expect(mentionCandidates('RUIZ', people).map((p) => p.userId)).toEqual(['jose']);
    expect(mentionCandidates('', people)).toHaveLength(4);
    expect(mentionCandidates('', people, 2)).toHaveLength(2);
    expect(mentionCandidates('zed', people)).toEqual([]);
  });

  it('reads who a message mentions, the longer name where one starts another', () => {
    expect(mentionedIn('Thanks @Al Smith!', people)).toEqual(['als']);
    expect(mentionedIn('@Al and @Noor Haddad, please', people).sort()).toEqual(['al', 'noor']);
    expect(mentionedIn('ping @jose.r', people)).toEqual(['jose']);
    expect(mentionedIn('@José Ruiz', people)).toEqual(['jose']);
    // A longer word isn't the name, and an address isn't a mention.
    expect(mentionedIn('@Alfred and sam@noor', people)).toEqual([]);
    expect(mentionedIn('@Noor @Noor', people)).toEqual(['noor']);
  });

  it('a name two people share: the picker writes the handle, and the name alone names neither', () => {
    const twins = [
      { userId: 'sam-k', displayName: 'Sam', handle: 'sam.k' },
      { userId: 'sam-b', displayName: 'Sam', handle: 'sam.b' },
      { userId: 'noor', displayName: 'Noor Haddad', handle: 'noor' },
    ];
    expect(mentionText(twins[1]!, twins)).toBe('sam.b');
    expect(mentionText(twins[2]!, twins)).toBe('Noor Haddad');
    expect(mentionedIn('@sam.b can you drive?', twins)).toEqual(['sam-b']);
    expect(mentionedIn('@Sam can you drive?', twins)).toEqual([]);
    // Someone whose name is another's handle is written by their own handle too.
    const clash = [
      { userId: 'a', displayName: 'noor', handle: 'noor.a' },
      { userId: 'b', displayName: 'Noor B', handle: 'noor' },
    ];
    expect(mentionText(clash[0]!, clash)).toBe('noor.a');
    expect(mentionedIn('@noor.a thanks', clash)).toEqual(['a']);
    expect(mentionedIn('Thanks @noor.', clash)).toEqual([]);
  });

  it('as written first, and accents set aside only where a letter can go without them', () => {
    const names = [
      { userId: 'zoe', displayName: 'Zoe', handle: 'zoe1' },
      { userId: 'zoë', displayName: 'Zoë', handle: 'zoe2' },
      { userId: 'yuko', displayName: 'ゆうこ', handle: 'yuko' },
      { userId: 'yugo', displayName: 'ゆうご', handle: 'yugo' },
      { userId: 'mohan', displayName: 'मोहन', handle: 'mohan' },
      { userId: 'mahan', displayName: 'महान', handle: 'mahan' },
      { userId: 'tanaka', displayName: '田中', handle: 'tanaka' },
    ];
    expect(mentionedIn('@Zoë hi', names)).toEqual(['zoë']);
    expect(mentionedIn('@Zoe hi', names)).toEqual(['zoe']);
    expect(mentionCandidates('ゆうご', names).map((p) => p.userId)).toEqual(['yugo']);
    expect(mentionedIn('@ゆうご 明日', names)).toEqual(['yugo']);
    expect(mentionCandidates('मोहन', names).map((p) => p.userId)).toEqual(['mohan']);
    expect(mentionedIn('@महान hi', names)).toEqual(['mahan']);
    // Written without spaces, a name runs straight into what follows it.
    expect(mentionedIn('@田中さん、お願いします', names)).toEqual(['tanaka']);
    // Without its accent, a name still finds the one person it could be.
    expect(mentionedIn('@jose ruiz, thanks', people)).toEqual(['jose']);
  });
});
