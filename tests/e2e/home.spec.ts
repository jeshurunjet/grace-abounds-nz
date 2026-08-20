import { expect, test } from '@playwright/test';

test('homepage and desktop navigation work', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Grace Abounds/ }),
  ).toBeVisible();
  for (const [name, path, heading] of [
    ['About', '/about', /About/],
    ['Location', '/location', /Locations/],
    ['Next Steps', '/next-steps', /Next/],
    ['Give', '/give', /Give/],
  ] as const) {
    await page
      .getByRole('navigation')
      .getByRole('link', { name, exact: true })
      .click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('heading', { level: 1, name: heading }),
    ).toBeVisible();
  }
});
test('auth preview pages load', async ({ page }) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Welcome Back' }),
  ).toBeVisible();
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Join Us' })).toBeVisible();
});
test('mobile navigation opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  await expect(
    page.getByRole('button', { name: 'Close menu' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'About', exact: true })
    .click();
  await expect(page).toHaveURL('/about');
});
