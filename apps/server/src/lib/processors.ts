/**
 * Who processes data for this Caime (R54): core's one list, told by this server's configuration
 * which of the configurable ones are in use, and who hosts it (HOSTING_PROVIDER).
 */

import { EDGE, HOSTING, SUB_PROCESSORS, type SubProcessor } from '@caime/core/processors';
import type { Config } from '../config';
import { AGE_PROVIDER_NAMES } from './age-provider';
import { mailOn } from './mail-address';
import { MAIL_PROVIDER_NAMES, SMTP_HOST_PROVIDERS } from './mail-provider';
import { SPEECH_PROVIDER_NAMES } from './speech';
import { TTS_PROVIDER_NAMES, ttsFor } from './tts';
import { ageChecksOn } from './users';

/** Who sends Caime's mail: the company behind a known SMTP host, else the host itself. */
function mailSender(url: string | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const provider = SMTP_HOST_PROVIDERS[host];
  return provider ? MAIL_PROVIDER_NAMES[provider] : `${host} (the email provider the operator set)`;
}

export function processorsFor(config: Config): SubProcessor[] {
  const list: SubProcessor[] = [
    { ...HOSTING, name: config.HOSTING_PROVIDER ?? 'Our hosting provider' },
    ...(config.EDGE_PROVIDER ? [{ ...EDGE, name: config.EDGE_PROVIDER }] : []),
  ];
  for (const p of SUB_PROCESSORS) {
    if (p.when !== 'configured') {
      list.push(p);
      continue;
    }
    if (p.id === 'cloudflare' && config.CLOUDFLARE_TURN_KEY_ID) list.push(p);
    if (p.id === 'speech' && config.SPEECH_PROVIDER && config.SPEECH_API_KEY)
      list.push({ ...p, name: SPEECH_PROVIDER_NAMES[config.SPEECH_PROVIDER] });
    if (p.id === 'tts' && config.TTS_PROVIDER && ttsFor(config))
      list.push({ ...p, name: TTS_PROVIDER_NAMES[config.TTS_PROVIDER] });
    // The phone apps push through Expo once they exist, whether or not a token raises the limit.
    if (p.id === 'expo') list.push(p);
    const mail = p.id === 'mail' ? mailSender(config.SMTP_URL) : null;
    if (mail) list.push({ ...p, name: mail });
    if (p.id === 'whatsapp' && config.WHATSAPP_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID)
      list.push(p);
    if (p.id === 'mail-in' && mailOn(config) && config.MAIL_PROVIDER)
      list.push({ ...p, name: MAIL_PROVIDER_NAMES[config.MAIL_PROVIDER] });
    if (p.id === 'age' && config.AGE_PROVIDER && ageChecksOn(config))
      list.push({ ...p, name: AGE_PROVIDER_NAMES[config.AGE_PROVIDER] });
  }
  return list;
}
