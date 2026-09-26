import { describe, expect, it } from 'vitest';
import { isApiToken, parseSignature, signatureBase } from './apps';
import { CreateOrgAppBody } from './schemas';

describe('apps', () => {
  it('reads a webhook signature header, and nothing that only looks like one', () => {
    expect(parseSignature('t=1790000000,v1=ab12cd')).toEqual({ t: 1790000000, v1: 'ab12cd' });
    expect(parseSignature(' t=1790000000 , v1=ab=12 ')).toEqual({ t: 1790000000, v1: 'ab=12' });
    expect(parseSignature('v1=ab12cd')).toBeNull();
    expect(parseSignature('t=soon,v1=ab')).toBeNull();
    expect(signatureBase(1790000000, '{"a":1}')).toBe('1790000000.{"a":1}');
  });

  it('knows its tokens, and takes only web addresses for webhooks', () => {
    expect(isApiToken('cai_abc')).toBe(true);
    expect(isApiToken('sess_abc')).toBe(false);
    expect(
      CreateOrgAppBody.safeParse({ name: 'Helpdesk', webhookUrl: 'ftp://x.example' }).success,
    ).toBe(false);
    expect(
      CreateOrgAppBody.parse({ name: 'Helpdesk', webhookUrl: 'https://hooks.example/caishy' }),
    ).toEqual({
      name: 'Helpdesk',
      scopes: [],
      webhookUrl: 'https://hooks.example/caishy',
      events: [],
    });
  });
});
