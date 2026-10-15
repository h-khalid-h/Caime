/**
 * WhatsApp, for proving a phone number (R91): a one-time code sent through Meta's WhatsApp
 * Business Platform (the Cloud API) with the operator's approved authentication template, which
 * carries the code in its body and in its copy-code button. Nothing else is ever sent this way,
 * and nothing comes back: no message from anyone's WhatsApp is read.
 */
import type { Config } from '../config';

export interface WhatsAppSender {
  /** Sends a code to a number in E.164; throws when Meta refuses. */
  sendCode(to: string, code: string): Promise<void>;
  /** The cheapest authenticated read (R78: provider health): the sending number itself. */
  ping(): Promise<void>;
}

const DEADLINE_MS = 10_000;

export function whatsappFor(config: Config): WhatsAppSender | null {
  if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) return null;
  const base = `${config.WHATSAPP_API.replace(/\/+$/, '')}/${config.WHATSAPP_PHONE_NUMBER_ID}`;
  const headers = {
    authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    'content-type': 'application/json',
  };
  return {
    async sendCode(to, code) {
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: config.WHATSAPP_TEMPLATE,
            language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: number } };
        throw new Error(`WhatsApp refused the code (${res.status}, ${body.error?.code ?? '-'})`);
      }
    },
    async ping() {
      const res = await fetch(`${base}?fields=display_phone_number`, {
        headers,
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!res.ok) throw new Error(`WhatsApp answered ${res.status}`);
    },
  };
}
