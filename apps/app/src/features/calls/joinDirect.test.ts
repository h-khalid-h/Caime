/** A meeting's Join in a direct conversation (R83): answer the ring, never a second call. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stack = vi.hoisted(() => ({
  answer: vi.fn(),
  startCall: vi.fn(),
  askNotes: vi.fn(),
  joinGroupMeeting: vi.fn(),
  checkLiveCalls: vi.fn(async () => {}),
}));
vi.mock('./load', () => ({
  loadCallStack: async () => stack,
  callStackOr: async () => stack,
}));
vi.mock('./rtc', () => ({ callsAvailable: true, onPhone: false }));
vi.mock('@/ui/Toast', () => ({ toast: vi.fn() }));

const { joinDirect, joinGroupMeeting } = await import('./calls');
const { useCall } = await import('@/state/calls');

const ringing = (conversationId: string, notes: { state: string } | null = null) =>
  useCall.setState({ phase: 'incoming', call: { conversationId, notes } as never });

describe('Join on a meeting with one person (R83)', () => {
  beforeEach(() => {
    stack.answer.mockReset();
    stack.startCall.mockReset();
    stack.askNotes.mockReset();
    stack.joinGroupMeeting.mockReset();
    stack.checkLiveCalls.mockReset();
    stack.checkLiveCalls.mockImplementation(async () => {});
    useCall.getState().reset();
  });
  it('starts the call when nothing is on', async () => {
    await joinDirect('c1');
    expect(stack.startCall).toHaveBeenCalledWith('c1', 'video');
    expect(stack.answer).not.toHaveBeenCalled();
  });
  it('answers the other’s call from the same conversation, when both pressed Join', async () => {
    ringing('c1');
    await joinDirect('c1');
    expect(stack.answer).toHaveBeenCalled();
    expect(stack.startCall).not.toHaveBeenCalled();
  });
  it('opened before the ring was heard, asks what’s live first and answers it', async () => {
    stack.checkLiveCalls.mockImplementation(async () => ringing('c1'));
    await joinDirect('c1');
    expect(stack.checkLiveCalls).toHaveBeenCalled();
    expect(stack.answer).toHaveBeenCalled();
    expect(stack.startCall).not.toHaveBeenCalled();
  });
  it('leaves any other call on this device as it is', async () => {
    ringing('c2');
    await joinDirect('c1');
    useCall.setState({ phase: 'active' });
    await joinDirect('c1');
    expect(stack.answer).not.toHaveBeenCalled();
    expect(stack.startCall).not.toHaveBeenCalled();
  });

  // M16 F7c: a meeting that says Cai takes notes, joined with Cai or without (R85 (1)).
  it('with Cai and nothing on, starts the call and asks while it rings', async () => {
    await joinDirect('c1', 'yes');
    expect(stack.startCall).toHaveBeenCalledWith('c1', 'video');
    expect(stack.askNotes).toHaveBeenCalled();
  });
  it('with Cai, answers the ring and asks when nobody has', async () => {
    ringing('c1');
    await joinDirect('c1', 'yes');
    expect(stack.answer).toHaveBeenCalledWith('yes');
    expect(stack.askNotes).toHaveBeenCalled();
  });
  it('with Cai, answers a ring that already asks with a yes, and asks nothing more', async () => {
    ringing('c1', { state: 'asking' });
    await joinDirect('c1', 'yes');
    expect(stack.answer).toHaveBeenCalledWith('yes');
    expect(stack.askNotes).not.toHaveBeenCalled();
  });
  it('without Cai, answers no to notes the ring asks for, and asks nothing', async () => {
    ringing('c1', { state: 'asking' });
    await joinDirect('c1', 'no');
    expect(stack.answer).toHaveBeenCalledWith('no');
    expect(stack.askNotes).not.toHaveBeenCalled();
  });
});

describe('Join on a meeting in a group (R83, M16 F7c)', () => {
  it('goes to the group call engine with the choice', async () => {
    await joinGroupMeeting('g1', 'yes');
    expect(stack.joinGroupMeeting).toHaveBeenCalledWith('g1', 'yes');
  });
});
