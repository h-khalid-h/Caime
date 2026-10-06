/**
 * The entry screens are painted by the server before the app runs (CLAUDE.md, the entry
 * screens): the twin must be the app's screen, word for word and place for place, on a phone and
 * on a desktop, or the swap shows. This measures where each line of text sits in the twin (the
 * app's scripts held back) and in the app, and fails on any that moved.
 */
import { type Browser, expect, test } from '@playwright/test';

const SCREENS: Record<string, string[]> = {
  '/welcome': [
    'Create your account',
    'I already have an account',
    'Free for people. Private by design: how you label someone is only ever yours.',
    'Say who someone is to you, once. Everything fits from then on.',
  ],
  '/sign-in': [
    'Welcome back',
    'Sign in with your email or @handle.',
    'Email or handle',
    'Password',
    'Sign in',
    'Forgot your password?',
    'New here?',
  ],
  '/sign-up': [
    'Create your account',
    'It takes a minute. You can change all of it later.',
    'Your name',
    'Handle',
    'Email',
    'Password',
    'Where you live',
    'Create account',
  ],
};

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function places(browser: Browser, path: string, width: number, height: number, app: boolean) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  if (!app) await page.route('**/_expo/static/js/**', (route) => route.abort());
  await page.goto(path);
  // The app has drawn the screen once every line is in it (a loading frame comes first).
  if (app)
    await page.waitForFunction(
      (texts) => texts.every((t) => document.querySelector('#root')?.textContent?.includes(t)),
      SCREENS[path] ?? [],
    );
  await page.evaluate(() => document.fonts.ready);
  const found = await page.evaluate(
    ({ app, texts }) => {
      const root = document.querySelector(app ? '#root' : '#static');
      const at: Record<string, string> = {};
      if (!root) return at;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        if (!texts.includes(text) || at[text]) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const box = range.getBoundingClientRect();
        if (box.height > 0) at[text] = `${Math.round(box.left)},${Math.round(box.top)}`;
      }
      return at;
    },
    { app, texts: SCREENS[path] ?? [] },
  );
  await context.close();
  return found;
}

for (const { name, width, height } of VIEWPORTS)
  for (const path of Object.keys(SCREENS))
    test(`${path} is the app's own screen before the app runs, on a ${name}`, async ({
      browser,
    }) => {
      const twin = await places(browser, path, width, height, false);
      const app = await places(browser, path, width, height, true);
      expect(Object.keys(app).sort()).toEqual([...(SCREENS[path] ?? [])].sort());
      expect(twin).toEqual(app);
    });
