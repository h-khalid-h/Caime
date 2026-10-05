import { describe, expect, it } from 'vitest';
import {
  canChangeDisappearing,
  canEditConversation,
  canRemoveOthersMessages,
  minorMayWriteToOrg,
} from './permissions';

describe('conversation permissions (convention 4)', () => {
  it('either side edits a one-to-one; a group’s owner and admins edit the group', () => {
    expect(canEditConversation('direct', 'member')).toBe(true);
    expect(canEditConversation('group', 'member')).toBe(false);
    expect(canEditConversation('group', 'admin')).toBe(true);
    expect(canEditConversation('group', 'owner')).toBe(true);
    expect(canEditConversation('business', null)).toBe(false);
  });

  it('only a group’s owner and admins remove someone else’s message; nobody in a one-to-one', () => {
    expect(canRemoveOthersMessages('direct', 'owner')).toBe(false);
    expect(canRemoveOthersMessages('group', 'member')).toBe(false);
    expect(canRemoveOthersMessages('group', 'admin')).toBe(true);
    expect(canRemoveOthersMessages('community', 'owner')).toBe(true);
  });

  it('disappearing messages follow the edit rule, and a topic follows its group', () => {
    expect(canChangeDisappearing('direct', 'member', false)).toBe(true);
    expect(canChangeDisappearing('group', 'admin', false)).toBe(true);
    expect(canChangeDisappearing('group', 'admin', true)).toBe(false);
    expect(canChangeDisappearing('group', 'member', false)).toBe(false);
  });

  it('under 18, only a verified organization may be written to (R29)', () => {
    expect(minorMayWriteToOrg(true, false)).toBe(false);
    expect(minorMayWriteToOrg(true, true)).toBe(true);
    expect(minorMayWriteToOrg(false, false)).toBe(true);
  });
});
