/**
 * Between organizations (R64): someone who runs an organization writes to another as it, in a
 * conversation of its own beside their personal one, and the other team sees whom it answers.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);

test('writing to an organization as one’s own, and the team seeing whom it answers', async ({
  browser,
}) => {
  const seller = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const buyer = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(seller, 'Noor Haddad', `noor.b2b.${stamp}`);
  await apiSignUp(buyer, 'Karim Saleh', `karim.b2b.${stamp}`);
  const org = async (ctx: typeof seller, name: string, handle: string) => {
    const made = await ctx.request.post('/v1/orgs', {
      headers: CLIENT,
      data: { name, handle, kind: 'business', country: 'EG' },
    });
    expect(made.ok(), await made.text()).toBe(true);
  };
  await org(seller, `Nile Dental ${stamp}`, `nile.b2b.${stamp}`);
  await org(buyer, `Acme Supply ${stamp}`, `acme.b2b.${stamp}`);

  const { page, errors } = await newPerson(buyer);
  await page.goto(`/o/nile.b2b.${stamp}`);
  const as = page.getByTestId('org-writing-as');
  await expect(as).toBeVisible();
  await expect(page.getByTestId('writing-as-me')).toBeChecked();
  await page.getByTestId(`writing-as-acme.b2b.${stamp}`).click();
  await expect(page.getByTestId(`writing-as-acme.b2b.${stamp}`)).toBeChecked();
  await page.getByTestId('org-message').click();
  await page.waitForURL(/\/c\//);
  await expect(visible(page, `As Acme Supply ${stamp}`).first()).toBeVisible();
  await expect(page.getByTestId('writing-as-line')).toBeVisible();
  const composer = page.getByTestId('composer-input');
  await composer.fill('We would like forty kits a month.');
  await page.getByTestId('composer-send').click();
  await expect(visible(page, 'We would like forty kits a month.')).toBeVisible();
  expect(errors).toEqual([]);

  // The seller's team sees the organization first, then who wrote for it.
  const team = await newPerson(seller);
  await team.page.goto('/');
  await team.page.getByRole('link', { name: 'Business, 1' }).click();
  await expect(team.page.getByTestId(`thread-row-karim.b2b.${stamp}`)).toContainText(
    `Acme Supply ${stamp} · Karim Saleh`,
  );
  expect(team.errors).toEqual([]);
  await seller.close();
  await buyer.close();
});
