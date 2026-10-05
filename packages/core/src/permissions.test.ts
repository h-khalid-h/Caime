import { describe, expect, it } from 'vitest';
import {
  canAddToGroup,
  canChangeDisappearing,
  canChangeGroupRole,
  canEditConversation,
  canPostTo,
  canRemoveFromGroup,
  canRemoveOthersMessages,
  handsOverOnLeaving,
  MANAGING_ROLES,
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

  it('a group’s owner and admins add people; in a broadcast only they post', () => {
    expect(canAddToGroup('admin')).toBe(true);
    expect(canAddToGroup('member')).toBe(false);
    expect(canAddToGroup(null)).toBe(false);
    expect(canPostTo('broadcast', 'member')).toBe(false);
    expect(canPostTo('broadcast', 'owner')).toBe(true);
    expect(canPostTo('group', 'member')).toBe(true);
    expect([...MANAGING_ROLES]).toEqual(['owner', 'admin']);
  });

  it('removing and promoting in a group follow the space rules; an owner leaving hands over', () => {
    expect(canRemoveFromGroup('owner', 'admin')).toBe(true);
    expect(canRemoveFromGroup('owner', 'owner')).toBe(false);
    expect(canRemoveFromGroup('admin', 'member')).toBe(true);
    expect(canRemoveFromGroup('admin', 'admin')).toBe(false);
    expect(canRemoveFromGroup('member', 'member')).toBe(false);
    expect(canChangeGroupRole('owner', 'member')).toBe(true);
    expect(canChangeGroupRole('admin', 'member')).toBe(false);
    expect(handsOverOnLeaving('owner')).toBe(true);
    expect(handsOverOnLeaving('admin')).toBe(false);
    expect(handsOverOnLeaving(null)).toBe(false);
  });

  it('under 18, only a verified organization may be written to (R29)', () => {
    expect(minorMayWriteToOrg(true, false)).toBe(false);
    expect(minorMayWriteToOrg(true, true)).toBe(true);
    expect(minorMayWriteToOrg(false, false)).toBe(true);
  });
});
