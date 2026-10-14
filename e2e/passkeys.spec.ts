/**
 * Passkeys (R36) in a real browser: Chromium's virtual authenticator (WebAuthn over CDP) stands
 * in for a phone's or a laptop's, so the browser's own ceremony runs against the server's real
 * verification. A passkey is added after the password in Settings · Security, then signs the
 * person in from the sign-in screen with nothing typed, and is removed.
 */
import { expect, type Page, test } from '@playwright/test';
import { apiSignUp, newPerson, PASSWORD, visible } from './helpers';

/** Signing out as a person does, from You, so the app has left the account before the next step. */
async function signOut(page: Page) {
  await page.goto('/you');
  await page.getByTestId('sign-out').filter({ visible: true }).click();
  await page.waitForURL('**/welcome');
}

test('a passkey is added after the password, signs in with nothing typed, and is removed', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const { page, errors } = await newPerson(context);
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await apiSignUp(context, 'Pia Keys', `pia.${Date.now().toString(36)}`);

  // Added after the password, named by the browser that made it.
  await page.goto('/settings/security');
  await page.getByTestId('passkey-add').filter({ visible: true }).click();
  await page.getByTestId('passkey-password').fill('not the password');
  await page.getByTestId('passkey-continue').click();
  await expect(visible(page, 'Your password isn’t right.')).toBeVisible();
  await page.getByTestId('passkey-password').fill(PASSWORD);
  await page.getByTestId('passkey-continue').click();
  await expect(visible(page, 'Passkey added. Next time, sign in with it.')).toBeVisible();
  const row = page.getByTestId('passkey-0').filter({ visible: true });
  // Playwright's desktop Chrome says it runs on Windows; the name is the browser's own word.
  await expect(row).toContainText(/Chrome · (Windows|macOS|Linux)/);
  await expect(row).toContainText('not used yet');

  // Signed out, back in with the passkey alone.
  await signOut(page);
  await page.goto('/sign-in');
  await page.getByTestId('signin-passkey').click();
  await expect(page.getByRole('img', { name: 'Pia Keys' }).first()).toBeVisible();
  await expect(page).not.toHaveURL(/sign-in/);

  // Used, then removed: the list says so, and the sign-in screen's passkey opens nothing more.
  await page.goto('/settings/security');
  await expect(page.getByTestId('passkey-0').filter({ visible: true })).toContainText('last used');
  await page.getByTestId('passkey-0').filter({ visible: true }).click();
  await page.getByTestId('passkey-remove').click();
  await expect(visible(page, 'Passkey removed')).toBeVisible();
  await expect(page.getByTestId('passkey-0')).toHaveCount(0);
  await signOut(page);
  await page.goto('/sign-in');
  await page.getByTestId('signin-passkey').click();
  await expect(page.getByTestId('signin-error')).toHaveText(
    'That passkey doesn’t open a Caime account.',
  );
  // The wrong password and the refused sign-in are the errors this test expects: each as the
  // request and as the browser's console echo of its status.
  const expected =
    /400 POST .*passkeys\/start|401 POST .*passkeys\/signin$|^console: Failed to load resource: the server responded with a status of 40[01]/;
  expect(errors.filter((e) => !expected.test(e))).toEqual([]);
  await context.close();
});
