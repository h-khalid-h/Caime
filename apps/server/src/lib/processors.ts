/**
 * Who processes data for this Caime (R54): core's one list, told by this server's configuration
 * which of the configurable ones are in use, and who hosts it (HOSTING_PROVIDER).
 */
import { HOSTING, SUB_PROCESSORS, type SubProcessor } from '@caime/core/processors';
import type { Config } from '../config';

/** The SMTP host, as a name for the mail provider ("smtp.postmarkapp.com"). */
function mailHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function processorsFor(config: Config): SubProcessor[] {
  const list: SubProcessor[] = [
    { ...HOSTING, name: config.HOSTING_PROVIDER ?? 'Our hosting provider' },
  ];
  for (const p of SUB_PROCESSORS) {
    if (p.when !== 'configured') {
      list.push(p);
      continue;
    }
    if (p.id === 'cloudflare' && config.CLOUDFLARE_TURN_KEY_ID) list.push(p);
    // The phone apps push through Expo once they exist, whether or not a token raises the limit.
    if (p.id === 'expo') list.push(p);
    const mail = p.id === 'mail' ? mailHost(config.SMTP_URL) : null;
    if (mail) list.push({ ...p, name: `${mail} (the email provider the operator set)` });
  }
  return list;
}
