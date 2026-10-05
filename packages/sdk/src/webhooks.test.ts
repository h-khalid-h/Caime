import { describe, expect, it } from 'vitest';
import { parseWebhook, signWebhook, verifyWebhookSignature, WebhookError } from './webhooks';

const secret = 'whsec_test_0123456789';
const delivery = {
  id: '0192a1b2-0000-7000-8000-000000000001',
  event: 'business.message',
  orgId: 'org-1',
  createdAt: '2026-09-30T12:00:00.000Z',
  data: {
    conversationId: 'c-1',
    message: { id: 'm-1', seq: 4, kind: 'text', body: 'Hello', createdAt: '2026-09-30T12:00:00Z' },
    customer: { id: 'u-1', displayName: 'Lina', handle: 'lina', under18: false },
  },
};
const body = JSON.stringify(delivery);
const t = 1_790_000_000;
const now = t * 1000 + 5_000;

describe('webhook signatures', () => {
  it('accept what Caime signed, within tolerance, and nothing else', () => {
    const header = signWebhook(secret, t, body);
    expect(header).toMatch(/^t=1790000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, header, body, { now })).toBe(true);
    expect(verifyWebhookSignature(secret, header, Buffer.from(body), { now })).toBe(true);
    // Another secret, a changed body, a stale delivery, a malformed header: refused.
    expect(verifyWebhookSignature('other', header, body, { now })).toBe(false);
    expect(verifyWebhookSignature(secret, header, `${body} `, { now })).toBe(false);
    expect(verifyWebhookSignature(secret, header, body, { now: now + 301_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, header, body, { now: now - 400_000 })).toBe(false);
    expect(
      verifyWebhookSignature(secret, header, body, {
        now: now + 3_000_000,
        toleranceSeconds: 3600,
      }),
    ).toBe(true);
    expect(verifyWebhookSignature(secret, 't=abc,v1=00', body, { now })).toBe(false);
    expect(verifyWebhookSignature(secret, null, body, { now })).toBe(false);
    // For a day after a secret is replaced, a delivery carries both signatures: either counts.
    const two = `${signWebhook('the-new-one', t, body)},v1=${signWebhook(secret, t, body).split('v1=')[1]}`;
    expect(verifyWebhookSignature(secret, two, body, { now })).toBe(true);
    expect(verifyWebhookSignature('the-new-one', two, body, { now })).toBe(true);
    expect(verifyWebhookSignature('a-third', two, body, { now })).toBe(false);
    expect(verifyWebhookSignature(secret, `t=${t},v1=${'0'.repeat(64)}`, body, { now })).toBe(
      false,
    );
  });

  it('parse a checked delivery into its typed event, from Node headers or a Headers', () => {
    const header = signWebhook(secret, t, body);
    const fromNode = parseWebhook(secret, { 'caime-signature': header }, body, { now });
    expect(fromNode.event).toBe('business.message');
    if (fromNode.event === 'business.message') {
      expect(fromNode.data.customer.under18).toBe(false);
      expect(fromNode.data.message.seq).toBe(4);
    }
    const fromHeaders = parseWebhook(secret, new Headers({ 'Caime-Signature': header }), body, {
      now,
    });
    expect(fromHeaders).toEqual(delivery);
    expect(() => parseWebhook(secret, {}, body, { now })).toThrow(WebhookError);
    try {
      parseWebhook(secret, { 'caime-signature': header }, body, { now: now + 1e6 });
      expect.unreachable('a stale delivery is refused');
    } catch (e) {
      expect((e as WebhookError).reason).toBe('timestamp');
    }
    try {
      parseWebhook('other', { 'caime-signature': header }, body, { now });
    } catch (e) {
      expect((e as WebhookError).reason).toBe('signature');
    }
    const notJson = 'nope';
    expect(() =>
      parseWebhook(secret, { 'caime-signature': signWebhook(secret, t, notJson) }, notJson, {
        now,
      }),
    ).toThrow('isn’t JSON');
    const odd = JSON.stringify({ id: 'x', event: 'unknown', orgId: 'o', createdAt: 'c', data: {} });
    expect(() =>
      parseWebhook(secret, { 'caime-signature': signWebhook(secret, t, odd) }, odd, { now }),
    ).toThrow('isn’t a delivery');
  });
});
