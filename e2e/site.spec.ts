/**
 * The public site in Arabic (R54): a visitor reads the site about Caime in Arabic, right to
 * left, by asking for it or because their browser does; the switch in the masthead takes them
 * to the other language and keeps them there as they move between pages.
 */
import { expect, test } from '@playwright/test';

test('the site about Caime reads in Arabic, and a reader who switches stays switched', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/business?lang=ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(
    page.getByRole('heading', { name: 'ردّ باسم مؤسستك، وأثبت هويتها.', level: 1 }),
  ).toBeVisible();
  // No script ran: the page is a page.
  await expect(page.locator('script[src]')).toHaveCount(0);
  // Moving within the site keeps the language.
  await page
    .getByRole('navigation', { name: 'Caime' })
    .getByRole('link', { name: 'الأسعار' })
    .click();
  await page.waitForURL(/\/pricing\?lang=ar$/);
  await expect(
    page.getByRole('heading', { name: 'مجاني للأفراد. والمؤسسات تدفع لفريقها.', level: 1 }),
  ).toBeVisible();
  // A spec-sheet row reads right to left: the label sits on the right of its value.
  const label = page.locator('dt', { hasText: 'لا يُحسب عليك أبدًا' }).first();
  const value = page.locator('dd', { hasText: 'محادثة يبدؤها عميل' }).first();
  const [l, v] = await Promise.all([label.boundingBox(), value.boundingBox()]);
  expect(l && v && l.x > v.x).toBe(true);
  // The way in keeps it: the sign-up screen paints in Arabic before the app, the app takes it as
  // this device's choice, and a plain reload stays in Arabic.
  await page.getByRole('link', { name: 'ابدأ مجانًا' }).click();
  await page.waitForURL(/\/sign-up\?lang=ar$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const create = page.getByRole('button', { name: 'إنشاء الحساب' }).filter({ visible: true });
  await expect(create).toBeVisible();
  await page.goto('/sign-up');
  await expect(create).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.goto('/pricing?lang=ar');
  // The switch: back to English, and the nav follows.
  await page.getByRole('link', { name: 'English' }).click();
  await page.waitForURL(/\/pricing\?lang=en$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(
    page.getByRole('heading', { name: 'Free for people. Organizations pay for their team.' }),
  ).toBeVisible();
  // English is this browser's own language, so from here the links carry nothing extra.
  await page.getByRole('navigation', { name: 'Caime' }).getByRole('link', { name: 'Home' }).click();
  await page.waitForURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: 'Messaging that understands your relationships.' }),
  ).toBeVisible();
  await context.close();
});

test('an Arabic browser gets the site in Arabic without asking', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar-EG' });
  const page = await context.newPage();
  await page.goto('/security');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('heading', { name: 'كل جانب من حياتك يرى ما اخترته.', level: 1 }),
  ).toBeVisible();
  // Its links carry nothing extra: the browser already says so.
  await expect(
    page.getByRole('navigation', { name: 'Caime' }).getByRole('link', { name: 'الرئيسية' }),
  ).toHaveAttribute('href', '/');
  await context.close();
});
