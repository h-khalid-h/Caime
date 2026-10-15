/**
 * Google's picker on the web (R90): its own page on Caime, opened in a window inside the tap (a
 * browser blocks one opened later), which hands back the one file picked by a message to this
 * window and closes. The phones' is googlePicker.native.ts.
 */
import { endpoints } from '@/api/endpoints';

export async function pickFromGoogle(accountId: string): Promise<string | null> {
  // Opened now, inside the tap; its address follows once the server has written it.
  const win = window.open('', 'caime-google-picker', 'popup,width=820,height=640');
  if (!win) throw new Error('blocked');
  let url: string;
  try {
    ({ url } = await endpoints.accountPicker(accountId, 'web'));
  } catch (e) {
    win.close();
    throw e;
  }
  win.location.href = url;
  return new Promise((resolve) => {
    const finish = (fileId: string | null) => {
      window.removeEventListener('message', heard);
      clearInterval(closed);
      resolve(fileId);
    };
    const heard = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== win) return;
      const picked = (e.data as { caimePicked?: unknown } | null)?.caimePicked;
      if (picked === undefined) return;
      finish(typeof picked === 'string' && picked ? picked : null);
    };
    window.addEventListener('message', heard);
    // A window closed without a pick says nothing, so it's looked at while it's open.
    const closed = setInterval(() => {
      if (win.closed) finish(null);
    }, 1000);
  });
}
