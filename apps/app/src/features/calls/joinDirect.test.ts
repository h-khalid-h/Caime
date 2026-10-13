/** A meeting's Join in a direct conversation (R83): answer the ring, never a second call. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stack = vi.hoisted(() => ({
  answer: vi.fn(),
  startCall: vi.fn(),
  checkLiveCalls: vi.fn(async () => {}),
}));
vi.mock('./load', () => ({
  loadCallStack: async () => stack,
  callStackOr: async () => stack,
}));
vi.mock('./rtc', () => ({ callsAvailable: true, onPhone: false }));
vi.mock('@/ui/Toast', () => ({ toast: vi.fn() }));

const { joinDirect } = await import('./calls');
const { useCall } = await import('@/state/calls');

const ringing = (conversationId: string) =>
  useCall.setState({ phase: 'incoming', call: { conversationId } as never });

describe('Join on a meeting with one person (R83)', () => {
  beforeEach(() => {
    stack.answer.mockReset();
    stack.startCall.mockReset();
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
});
