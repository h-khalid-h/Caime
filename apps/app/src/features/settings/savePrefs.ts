import type { MeView } from '@caime/core/api';
import { request } from '@/api/client';
import { isWeb } from '@/lib/config';
import { useLanguage } from '@/lib/languageState';
import { clearPrefsPending, markPrefsPending } from '@/state/prefsPending';
import { useSession } from '@/state/session';
import { type PrefValues, usePrefs } from '@/theme/prefs';

let timer: ReturnType<typeof setTimeout> | null = null;
/** Failed sends so far; the next try waits longer each time, and gives up after RETRIES. */
let failures = 0;
const RETRIES = 5;

/** The device's whole choice, as the account keeps it. */
function snapshot(): Record<string, unknown> {
  const p = usePrefs.getState();
  const preferences: Record<string, unknown> = {
    theme: p.theme,
    personality: p.personality,
    bubbleTheme: p.bubbleTheme,
    reduceMotion: p.reduceMotion,
    holdWhileBusy: p.holdWhileBusy,
    language: p.language,
    learnFromChoices: p.learnFromChoices,
    caiBrief: p.caiBrief,
    arabicVariety: p.arabicVariety,
  };
  if (p.enterToSend !== null) preferences.enterToSend = p.enterToSend;
  // The language this device shows (what `auto` came to), so the server writes to this person
  // in it (R54). Sent with the choice, in the one request, so nothing the account answers back
  // can predate it.
  const shown = useLanguage.getState().language;
  if (shown) preferences.interfaceLanguage = shown;
  return preferences;
}

function send(keepalive = false): void {
  timer = null;
  void request<{ user: MeView }>('PATCH', '/me', { body: { preferences: snapshot() }, keepalive })
    .then((res) => {
      failures = 0;
      useSession.getState().setUser(res.user);
      clearPrefsPending();
    })
    .catch(() => {
      // The account doesn't have the device's choice yet: it stays pending (so a refresh of the
      // account can't put the older choice back) and is sent again, a little later each time.
      // A device that stays offline keeps its own choice; the account catches up at the next
      // save, or the next launch's save.
      failures += 1;
      if (failures > RETRIES || keepalive) {
        failures = 0;
        clearPrefsPending();
        return;
      }
      timer = setTimeout(send, Math.min(60_000, 2_000 * 2 ** (failures - 1)));
    });
}

/**
 * Apply now on this device, mirror to the account shortly after (every device follows). Until
 * the account has it, what's read back from the account doesn't replace it (prefsPending).
 */
export function savePrefs(patch: Partial<PrefValues>): void {
  usePrefs.getState().set(patch);
  if (timer) clearTimeout(timer);
  else markPrefsPending();
  timer = setTimeout(send, 600);
}

// A setting changed just before the tab goes (a reload, a link) is saved as it goes, not lost:
// the request is let outlive the page.
if (isWeb && typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    if (!timer) return;
    clearTimeout(timer);
    send(true);
  });
